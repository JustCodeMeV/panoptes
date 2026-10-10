import type { Feature, LayerResponse, ProviderStatus } from '../../shared/feature.ts'
import type { LiveEvent } from '../../shared/live.ts'
import { eventsPerMin, publish, registerStream } from '../core/hub.ts'
import { registerStories, relatedMarkets } from '../core/xref.ts'
import type { Assessment, Coverage, Signal } from '../../shared/truth.ts'
import { scoreLocations } from '../geo/gazetteer.ts'
import { assess } from '../truth/assess.ts'
import type { Campaign, CampaignFlag, SourceClass } from '../../shared/truth.ts'
import { establishedOutlet, outletCountry, socialSource, stateBloc, stateOutlet } from '../truth/domains.ts'
import { loadCorpus, matchFactChecks } from '../truth/factchecks.ts'
import { hash, tokenSet } from '../truth/text.ts'
import { isTopical } from '../truth/topics.ts'
import { pollFeed, type NewsItem } from './ingest.ts'
import { backoffMs } from '../core/aggregate.ts'
import { NEWS_FEEDS } from './sources.ts'
import { redact } from '../core/secrets.ts'
import { every } from '../runtime/jobs.ts'

export const LAYER_ID = 'news'
const WINDOW_MS = 36 * 3600_000
const MAX_STORIES = 220

export type Story = { id: string; items: NewsItem[]; tokens: Set<string>[]; sig: string; verdict: string; flags: string }

const stories = new Map<string, Story>()
const seen = new Set<string>() // item ids
const seenTitles = new Set<string>()
const features = new Map<string, Feature>()
const feedStatus = new Map<string, ProviderStatus>()
let primed = false

export const statusList = (): ProviderStatus[] => [...feedStatus.values()]

export function snapshot(): LayerResponse {
  return { layerId: LAYER_ID, generatedAt: new Date().toISOString(), features: [...features.values()], providers: statusList() }
}
const heartbeat = (): LiveEvent => ({ type: 'status', at: Date.now(), providers: statusList(), eventsPerMin: eventsPerMin(LAYER_ID) })
registerStream(LAYER_ID, { snapshot, heartbeat })

// ---------- clustering ----------

const itemTokens = (i: NewsItem) => tokenSet(i.title)

// Newsroom vocabulary: frequent in unrelated security stories, so it never makes two headlines "the same story".
const GENERIC = new Set(
  `police protest protester killed attack attacks strike strikes clash clashes military troops army forces government minister
president official officials leader leaders country countries people dozen dozens injured dead death deaths arrest arrested
security election vote opposition border state city capital world global international warns urges calls amid`.split(/\s+/),
)

/** Shared generic words ("police", "protest", "killed") are not enough: at least one shared word must be distinctive. */
export function similar(a: Set<string>, b: Set<string>): boolean {
  let shared = 0
  let strong = 0
  for (const t of a) {
    if (!b.has(t)) continue
    shared++
    if (t.length >= 5 && !GENERIC.has(t)) strong++
  }
  if (!strong) return false
  const ratio = shared / Math.min(a.size, b.size)
  return (shared >= 3 && strong >= 2) || (shared >= 2 && ratio >= 0.6) || (shared >= 2 && strong >= 1 && ratio >= 0.5 && [...a].some((t) => t.length >= 7 && b.has(t)))
}

/** Country an item is about, from its own title (weighs most) and summary. */
const itemCountry = new Map<string, string | undefined>()
function countryOfItem(i: NewsItem): string | undefined {
  if (!itemCountry.has(i.id)) {
    const r = scoreLocations([{ text: i.title, weight: 3 }, { text: i.summary, weight: 1 }])
    itemCountry.set(i.id, r && r.confidence >= 0.5 ? (r.country ?? r.name) : undefined)
  }
  return itemCountry.get(i.id)
}

/** Most common country among a story's items, if any item names one. */
function storyCountry(s: Story): string | undefined {
  const n = new Map<string, number>()
  for (const i of s.items) {
    const c = countryOfItem(i)
    if (c) n.set(c, (n.get(c) ?? 0) + 1)
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/**
 * Story an item belongs to. Compared against the story's opening reports and
 * its latest ones (not every item ever, which let stories drift by chaining),
 * and never across countries: a Ugandan story cannot join a French one just
 * because both mention police and protests.
 */
function findStory(tokens: Set<string>, item: NewsItem): Story | undefined {
  if (tokens.size < 2) return undefined
  const country = countryOfItem(item)
  for (const s of stories.values()) {
    const probe = s.tokens.length > 11 ? [...s.tokens.slice(0, 3), ...s.tokens.slice(-8)] : s.tokens
    if (!probe.some((t) => similar(tokens, t))) continue
    const sc = country && storyCountry(s)
    if (sc && sc !== country) continue
    return s
  }
}

// ---------- analysis ----------

export const classOf = (domain: string): SourceClass =>
  socialSource(domain) ? 'social' : establishedOutlet(domain) ? 'established' : stateOutlet(domain) ? 'state' : 'other'
const rank = (i: NewsItem) => ({ established: 0, other: 1, state: 2, social: 3 })[classOf(i.domain)]

/** How a story spread: who was first, state-media alignment, speed, social surge. */
export function campaignOf(story: Story, strongFalse: boolean, marketMove: boolean): Campaign {
  const sorted = [...story.items].sort((a, b) => a.published - b.published)
  const t0 = sorted[0].published
  const timeline = sorted.slice(0, 40).map((i) => ({
    at: i.published,
    source: i.domain,
    cls: classOf(i.domain),
    bloc: stateBloc(i.domain),
    title: i.title,
    url: i.url,
  }))
  const firstOf = (cls: SourceClass) => sorted.find((i) => classOf(i.domain) === cls)
  const fs = firstOf('state')
  const fe = firstOf('established')
  const stateLeadMin = fs && fe ? Math.round((fe.published - fs.published) / 60_000) : undefined
  const blocs = [...new Set(sorted.map((i) => stateBloc(i.domain)).filter((b): b is string => !!b))]
  const social = new Set(sorted.filter((i) => classOf(i.domain) === 'social').map((i) => i.domain))
  const firstHour = new Set(sorted.filter((i) => i.published - t0 <= 3600_000).map((i) => i.domain)).size
  const ageMin = (Date.now() - t0) / 60_000

  const est = [...new Set(sorted.filter((i) => classOf(i.domain) === 'established').map((i) => i.domain))]
  const estCount = est.length
  // Widely corroborated stories are simply news: patterns on them are not suspicious. "Widely" means
  // independent outlets from more than one country, so one national press echoing itself does not count.
  const widely = estCount >= 3 && new Set(est.map((d) => outletCountry(d))).size >= 2
  const flags: CampaignFlag[] = []
  const flag = (id: string, label: string, severity: CampaignFlag['severity'], detail: string) => flags.push({ id, label, severity, detail })
  if (!widely) {
    if (fs && fe && (stateLeadMin ?? 0) >= 60 && (stateLeadMin ?? 0) <= 1440) {
      flag('state-first', 'Government outlet first', 'warn', `${fs.domain} (${stateBloc(fs.domain)} government) ran it ${stateLeadMin} min before the first independent outlet (${fe.domain})`)
    }
    if (fs && !fe && ageMin >= 60 && ageMin <= 720) {
      flag('state-only', 'Government outlets only', 'info', `no independent outlet in ${Math.round(ageMin)} min; carried by ${[...new Set(sorted.filter((i) => classOf(i.domain) === 'state').map((i) => `${i.domain} (${stateBloc(i.domain)})`))].join(', ')}`)
    }
    if (blocs.length >= 2) flag('multi-bloc', 'Several governments push it', blocs.length >= 3 ? 'alert' : 'warn', `outlets of the ${blocs.join(' + ')} governments carry the same story${estCount ? ` (only ${estCount} independent outlet${estCount === 1 ? '' : 's'})` : ' with no independent outlet'}`)
    if (social.size >= 3) flag('social-surge', 'Social surge', 'warn', `${social.size} distinct social accounts/channels amplify it${estCount ? '' : ' with no independent outlet'}`)
    if (sorted[0] && classOf(sorted[0].domain) === 'social' && !fe) flag('social-first', 'Social-first', 'info', `first seen on ${sorted[0].domain}, no independent outlet yet`)
    if (firstHour >= 5 && estCount < 2) flag('rapid', 'Rapid spread', 'info', `${firstHour} distinct sources within an hour of the first report`)
  }
  if (strongFalse) flag('contradicted', 'Contradicted', 'alert', 'a published fact-check rates a matching claim false while the story is still circulating')
  if (marketMove) flag('market', 'Market reacting', 'info', 'a related prediction market moved sharply')

  const W: Record<string, number> = { 'state-first': 20, 'state-only': 5, 'multi-bloc': 30, rapid: 10, 'social-surge': 20, 'social-first': 5, contradicted: 40, market: 10 }
  const score = Math.min(100, flags.reduce((n, f) => n + (W[f.id] ?? 0), 0))
  return { score, flags, timeline, blocs, socialAccounts: social.size, stateLeadMin, firstHourSources: firstHour }
}

async function analyze(story: Story): Promise<Feature> {
  const items = [...story.items].sort((a, b) => rank(a) - rank(b) || a.published - b.published)
  const best = items[0]
  const first = [...story.items].sort((a, b) => a.published - b.published)[0]
  const outletItems = story.items.filter((i) => !socialSource(i.domain))
  const domains = [...new Set(outletItems.map((i) => i.domain))]
  const socialDomains = [...new Set(story.items.filter((i) => socialSource(i.domain)).map((i) => i.domain))]
  const established = [...new Set(domains.map((d) => establishedOutlet(d)).filter((d): d is string => !!d))]
  const state = [...new Set(domains.map((d) => stateOutlet(d)).filter((d): d is string => !!d))]

  const coverage: Coverage = {
    query: [...story.tokens[0]].slice(0, 5).join(' '),
    window: '24h',
    total: outletItems.length,
    domains: domains.length,
    countries: [],
    establishedOutlets: established,
    stateOutlets: state,
    articles: items.slice(0, 8).map((i) => ({ url: i.url, title: i.title, domain: i.domain, seen: new Date(i.published).toISOString() })),
  }
  const signals: Signal[] = [...domains, ...socialDomains].map((d) => {
    const i = story.items.find((x) => x.domain === d)!
    const social = socialSource(d)
    return { platform: social ? (d.startsWith('bsky:') ? 'bluesky' : 'telegram') : 'news', region: d, text: i.title, url: i.url, at: new Date(i.published).toISOString() }
  })

  const corpus = await loadCorpus().catch(() => null)
  const factChecks = corpus ? matchFactChecks(corpus, `${best.title} ${best.summary.slice(0, 160)}`) : []
  const markets = relatedMarkets(best.title)
  const a: Assessment = assess({ signals, factChecks, coverage, markets })
  a.campaign = campaignOf(story, a.verdict === 'debunked', markets.some((m) => !m.playMoney && Math.abs(m.change24h ?? 0) >= 0.08))

  // Titles carry the location; summaries only nudge (they mention sources, other places, background).
  const hit = scoreLocations(items.slice(0, 12).flatMap((i) => [{ text: i.title, weight: 3 }, { text: i.summary, weight: 0.5 }]))
  const naming = hit ? items.filter((i) => countryOfItem(i) === (hit.country ?? hit.name)).length : 0
  const now = new Date().toISOString()
  return {
    id: story.id,
    layerId: LAYER_ID,
    title: best.title,
    position: hit ? { lat: hit.lat, lon: hit.lon } : undefined,
    geoPrecision: hit ? 'inferred' : 'none',
    geoBasis: hit
      ? `${naming > 1 ? `${naming} of ${items.length} reports name` : 'story names'} ${hit.kind === 'place' ? `"${hit.name}" (${hit.country ?? hit.kind})` : `"${hit.name}"`}`
      : 'no location named in the story',
    observedAt: new Date(first.published).toISOString(),
    source: { provider: 'news-wire', platform: best.domain, url: best.url, retrievedAt: now },
    tags: [a.verdict, 'news', ...state.map(() => 'state-media')],
    props: {
      assessment: a,
      kind: 'news',
      risk: a.risk,
      verdict: a.verdict,
      outlets: domains.length,
      social: socialDomains.length,
      campaign: a.campaign.score,
      items: story.items.length,
      updatedAt: Math.max(...story.items.map((i) => i.published)),
    },
  }
}

const signature = (f: Feature) => {
  const a = f.props.assessment as Assessment
  return `${a.verdict}|${f.props.outlets}|${f.props.social}|${f.props.campaign}|${a.risk}|${a.markets?.map((m) => Math.round(m.p * 20)).join(',') ?? ''}`
}

async function ingest(list: NewsItem[], silent: boolean) {
  const touched = new Map<Story, { created: boolean; item: NewsItem }>()
  const cutoff = Date.now() - WINDOW_MS
  for (const it of list) {
    if (seen.has(it.id) || it.published < cutoff) continue
    seen.add(it.id)
    const key = it.title.toLowerCase().slice(0, 80)
    if (seenTitles.has(key)) continue
    seenTitles.add(key)
    if (!isTopical(`${it.title} ${it.summary}`)) continue
    const tk = itemTokens(it)
    const existing = findStory(tk, it)
    if (existing) {
      if (existing.items.some((x) => x.domain === it.domain && x.title === it.title)) continue
      existing.items.push(it)
      existing.tokens.push(tk)
      touched.set(existing, { created: touched.get(existing)?.created ?? false, item: it })
    } else {
      const story: Story = { id: `${LAYER_ID}:${hash(it.id)}`, items: [it], tokens: [tk], sig: '', verdict: '', flags: '' }
      stories.set(story.id, story)
      touched.set(story, { created: true, item: it })
    }
  }

  for (const [story, { created, item }] of touched) {
    const f = await analyze(story)
    const sig = signature(f)
    const prevVerdict = story.verdict
    features.set(f.id, f)
    const unchanged = !created && sig === story.sig
    story.sig = sig
    story.verdict = f.props.verdict as string
    const flagsNow = (f.props.assessment as Assessment).campaign?.flags ?? []
    const newFlags = flagsNow.filter((x) => !story.flags.split(',').includes(x.id))
    story.flags = flagsNow.map((x) => x.id).join(',')
    if (silent || unchanged) continue
    const a = f.props.assessment as Assessment
    let change: string | undefined
    if (!created || newFlags.length) {
      const parts = [`+${item.domain}`, `${f.props.outlets} outlets${Number(f.props.social) ? ` + ${f.props.social} social` : ''}`]
      if (prevVerdict && prevVerdict !== a.verdict) parts.push(`${prevVerdict} → ${a.verdict}`)
      for (const nf of newFlags) parts.push(`⚑ ${nf.label}`)
      change = parts.join(' · ')
    }
    publish(LAYER_ID, { type: 'upsert', kind: created ? 'new' : 'update', feature: f, change, item: { title: item.title, source: item.domain, at: item.published } })
  }
}

/** Posts from the Telegram scouts join stories as social reports (server/telegram/engine.ts). */
export const ingestSocial = (items: NewsItem[], silent: boolean) => ingest(items, silent || !primed)

function prune() {
  const cutoff = Date.now() - WINDOW_MS
  const gone: string[] = []
  for (const s of stories.values()) {
    if (Math.max(...s.items.map((i) => i.published)) < cutoff) gone.push(s.id)
  }
  if (stories.size - gone.length > MAX_STORIES) {
    const byAge = [...stories.values()].filter((s) => !gone.includes(s.id)).sort((a, b) => Math.max(...a.items.map((i) => i.published)) - Math.max(...b.items.map((i) => i.published)))
    gone.push(...byAge.slice(0, stories.size - gone.length - MAX_STORIES).map((s) => s.id))
  }
  if (!gone.length) return
  for (const id of gone) {
    for (const i of stories.get(id)?.items ?? []) itemCountry.delete(i.id)
    stories.delete(id)
    features.delete(id)
  }
  publish(LAYER_ID, { type: 'remove', ids: gone })
}

registerStories(() =>
  [...stories.values()].map((st) => {
    const f = features.get(st.id)
    return { id: st.id, title: f?.title ?? st.items[0].title, outlets: Number(f?.props.outlets ?? 1), verdict: String(f?.props.verdict ?? 'insufficient'), tokens: tokenSet(f?.title ?? st.items[0].title) }
  }),
)

// ---------- polling loop ----------

let started = false
/** Feeds whose backlog has been absorbed; their first successful poll is always silent. */
const feedPrimed = new Set<string>()
export function startNewsEngine() {
  if (started) return
  started = true
  const backoff = new Map<string, { failures: number; tryAt: number }>()
  const pollOne = async (feed: (typeof NEWS_FEEDS)[number], silent: boolean) => {
    const b = backoff.get(feed.id)
    if (b && Date.now() < b.tryAt) return // feed is erroring or rate-limiting us: wait it out
    const t0 = Date.now()
    try {
      const items = await pollFeed(feed)
      if (items) {
        await ingest(items, silent || !feedPrimed.has(feed.id))
        feedPrimed.add(feed.id)
      }
      const prev = feedStatus.get(feed.id)
      if (b) console.log(`[news:${feed.id}] recovered after ${b.failures} failure(s)`)
      backoff.delete(feed.id)
      feedStatus.set(feed.id, { id: feed.id, ok: true, count: items?.length ?? prev?.count ?? 0, ms: Date.now() - t0 })
    } catch (e) {
      const error = redact(e instanceof Error ? e.message : String(e))
      const failures = (b?.failures ?? 0) + 1
      const every = feed.everyMs ?? 30_000
      backoff.set(feed.id, { failures, tryAt: Date.now() + backoffMs(failures, every, Number(error.match(/HTTP (\d{3})/)?.[1]) || 0) })
      if (failures === 1 || failures % 10 === 0) console.warn(`[news:${feed.id}] failed (${failures}x): ${error}`)
      // Stories from this feed stay up; one failed poll is not an outage.
      const prev = feedStatus.get(feed.id)
      const stale = failures < 3 && !!prev?.count
      feedStatus.set(feed.id, { id: feed.id, ok: stale, count: prev?.count ?? 0, error, ms: Date.now() - t0, ...(stale ? { stale: true } : {}) })
    }
  }
  void (async () => {
    // Prime silently so the first snapshot is the backlog, not a flood of "breaking" events.
    const queue = [...NEWS_FEEDS]
    await Promise.all(Array.from({ length: 8 }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) await pollOne(f, true)
    }))
    primed = true
    console.log(`[news] primed: ${stories.size} stories from ${NEWS_FEEDS.length} feeds`)
    // Staggered so the feeds do not all fire in the same second
    NEWS_FEEDS.forEach((feed, i) => every(`news:${feed.id}`, feed.everyMs ?? 30_000, () => void pollOne(feed, false), (i * 1300) % (feed.everyMs ?? 30_000)))
    every('news:prune', 5 * 60_000, prune)
  })()
}
export const isPrimed = () => primed
