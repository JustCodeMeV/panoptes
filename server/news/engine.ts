import type { Feature, LayerResponse, ProviderStatus } from '../../shared/feature.ts'
import type { LiveEvent } from '../../shared/live.ts'
import { eventsPerMin, publish, registerStream } from '../core/hub.ts'
import { registerStories, relatedMarkets } from '../core/xref.ts'
import type { Assessment, Coverage, Signal } from '../../shared/truth.ts'
import { geolocate } from '../geo/gazetteer.ts'
import { assess } from '../truth/assess.ts'
import type { Campaign, CampaignFlag, SourceClass } from '../../shared/truth.ts'
import { establishedOutlet, socialSource, stateBloc, stateOutlet } from '../truth/domains.ts'
import { loadCorpus, matchFactChecks } from '../truth/factchecks.ts'
import { hash, tokenSet } from '../truth/text.ts'
import { isTopical } from '../truth/topics.ts'
import { pollFeed, type NewsItem } from './ingest.ts'
import { NEWS_FEEDS } from './sources.ts'

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

export function similar(a: Set<string>, b: Set<string>): boolean {
  let shared = 0
  let long = false
  for (const t of a) {
    if (!b.has(t)) continue
    shared++
    if (t.length >= 7) long = true
  }
  return shared >= 3 || (shared >= 2 && shared / Math.min(a.size, b.size) >= 0.6) || (shared >= 2 && long && shared / Math.min(a.size, b.size) >= 0.5)
}

function findStory(tokens: Set<string>): Story | undefined {
  if (tokens.size < 2) return undefined
  for (const s of stories.values()) if (s.tokens.some((t) => similar(tokens, t))) return s
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

  const estCount = new Set(sorted.filter((i) => classOf(i.domain) === 'established').map((i) => i.domain)).size
  // Widely corroborated stories are simply news: patterns on them are not suspicious.
  const widely = estCount >= 3
  const flags: CampaignFlag[] = []
  const flag = (id: string, label: string, severity: CampaignFlag['severity'], detail: string) => flags.push({ id, label, severity, detail })
  if (!widely) {
    if (fs && fe && (stateLeadMin ?? 0) >= 60 && (stateLeadMin ?? 0) <= 1440) {
      flag('state-first', 'State media first', 'warn', `${fs.domain} ran it ${stateLeadMin} min before the first established outlet (${fe.domain})`)
    }
    if (fs && !fe && ageMin >= 60 && ageMin <= 720) {
      flag('state-only', 'State-only story', 'info', `no established outlet in ${Math.round(ageMin)} min; carried by ${[...new Set(sorted.filter((i) => classOf(i.domain) === 'state').map((i) => i.domain))].join(', ')}`)
    }
    if (blocs.length >= 2) flag('multi-bloc', 'Aligned state outlets', 'alert', `outlets from ${blocs.join(' + ')} carry the same story${estCount ? ` (only ${estCount} established outlet${estCount === 1 ? '' : 's'})` : ''}`)
    if (social.size >= 3) flag('social-surge', 'Social surge', 'warn', `${social.size} distinct social accounts/channels amplify it${estCount ? '' : ' with no established outlet'}`)
    if (sorted[0] && classOf(sorted[0].domain) === 'social' && !fe) flag('social-first', 'Social-first', 'info', `first seen on ${sorted[0].domain}, no established outlet yet`)
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

  const hit = geolocate(...items.map((i) => i.title), best.summary)
  const now = new Date().toISOString()
  return {
    id: story.id,
    layerId: LAYER_ID,
    title: best.title,
    position: hit ? { lat: hit.lat, lon: hit.lon } : undefined,
    geoPrecision: hit ? 'inferred' : 'none',
    geoBasis: hit ? `story mentions "${hit.name}" (${hit.kind})` : 'no location named in the story',
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
    const existing = findStory(tk)
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
  const pollOne = async (feed: (typeof NEWS_FEEDS)[number], silent: boolean) => {
    const t0 = Date.now()
    try {
      const items = await pollFeed(feed)
      if (items) {
        await ingest(items, silent || !feedPrimed.has(feed.id))
        feedPrimed.add(feed.id)
      }
      const prev = feedStatus.get(feed.id)
      feedStatus.set(feed.id, { id: feed.id, ok: true, count: items?.length ?? prev?.count ?? 0, ms: Date.now() - t0 })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      console.warn(`[news:${feed.id}] ${error}`)
      feedStatus.set(feed.id, { id: feed.id, ok: false, count: 0, error, ms: Date.now() - t0 })
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
    NEWS_FEEDS.forEach((feed, i) =>
      setTimeout(() => setInterval(() => void pollOne(feed, false), feed.everyMs ?? 30_000), (i * 1300) % (feed.everyMs ?? 30_000)),
    )
    setInterval(prune, 5 * 60_000)
  })()
}
export const isPrimed = () => primed
