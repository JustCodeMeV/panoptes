import type { Feature } from '../../shared/feature'
import type { LiveEvent } from '../../shared/live'
import type { MarketProps } from '../../shared/markets'
import type { NetGraph } from '../../shared/network'
import type { Assessment, Brief, Campaign, CampaignFlag, FactCheckMatch } from '../../shared/truth'
import { useCases } from '../core/cases'
import { useGlobeUi } from '../globe/globeUi'
import { useInvestigation } from '../core/investigation'
import type { Edge, Entity } from '../../shared/entities'
import { useDemo } from '../core/demo'
import { useStore } from '../core/store'
import { useWatches, type Watch } from '../layers/watch/state'

/**
 * SCRIPTED REPLAY, NOT LIVE DATA. One rumour followed from first post to debunk,
 * through the same UI and data shapes the live engines use. Everything is
 * tagged `demo` and titled so it can never be mistaken for a real event.
 * Runs offline, so the demo works even when real feeds are quiet.
 */
const HORMUZ = { lat: 26.57, lon: 56.25 }
const STORY = 'news:demo-hormuz'
const MARKET = 'markets:demo-hormuz'
const STREAM = 'livestreams:youtube:demo-aljazeera'
const CASE_TITLE = 'DEMO: Hormuz tanker rumour'
const ALERT = `watch:demo:${STORY}`
const TG = ['intelslava', 'rybar', 'News_of_Donbass'].map((h) => `telegram:demo-${h.toLowerCase()}`)
const CII = 'cii:demo-iran'
const WATCH: Watch = { id: -1, name: 'DEMO: Strait of Hormuz', lat: HORMUZ.lat, lon: HORMUZ.lon, radiusKm: 300, layers: [], created: new Date().toISOString() }
/** Number of narrated steps; the banner shows "step n/STEPS". */
export const STEPS = 13

const sleep = (ms: number, s: AbortSignal) =>
  new Promise<void>((res, rej) => {
    if (s.aborted) return rej(new Error('stopped'))
    const stop = () => (clearTimeout(t), rej(new Error('stopped')))
    const t = setTimeout(() => (s.removeEventListener('abort', stop), res()), ms)
    s.addEventListener('abort', stop, { once: true })
  })

type Src = { at: number; source: string; cls: 'established' | 'state' | 'social' | 'other'; bloc?: string; title: string }

const T0 = () => Date.now() - 50 * 60_000

const FLAG = {
  socialFirst: { id: 'social-first', label: 'Social-first', severity: 'info', detail: 'first seen on t.me/intelslava, no independent outlet yet' },
  surge: { id: 'social-surge', label: 'Social surge', severity: 'warn', detail: '4 distinct social accounts/channels amplify it with no independent outlet' },
  stateFirst: { id: 'state-first', label: 'Government outlet first', severity: 'warn', detail: 'tass.com ran it with no independent outlet confirming' },
  bloc: { id: 'multi-bloc', label: 'Several governments push it', severity: 'warn', detail: 'outlets of the RU + IR governments carry the same story with no independent outlet' },
  contradicted: { id: 'contradicted', label: 'Contradicted', severity: 'alert', detail: 'a published fact-check rates a matching claim false while the story is still circulating' },
  market: { id: 'market', label: 'Market reacting', severity: 'info', detail: 'a related prediction market moved sharply' },
} satisfies Record<string, CampaignFlag>

const marketRef = (p: number, d: number) => ({
  id: MARKET, platform: 'polymarket' as const, title: 'US–Iran Hormuz agreement by October 31?', headline: 'Yes', url: 'https://polymarket.com',
  p, change24h: d, volume: 420_000, unit: 'usd' as const, playMoney: false, trust: 78,
})

function story(opts: { items: Src[]; verdict: Assessment['verdict']; risk: number; reasons: string[]; flags: CampaignFlag[]; score: number; blocs?: string[]; fc?: FactCheckMatch[]; market?: boolean; est?: number; network?: NetGraph; brief?: Brief }): Feature {
  const t0 = T0()
  const sorted = opts.items
  const campaign: Campaign = {
    score: opts.score,
    flags: opts.flags,
    timeline: sorted.map((i) => ({ at: i.at, source: i.source, cls: i.cls, bloc: i.bloc, title: i.title, url: `#demo-${i.source}` })),
    blocs: opts.blocs ?? [],
    socialAccounts: sorted.filter((i) => i.cls === 'social').length,
    firstHourSources: sorted.length,
  }
  const state = sorted.filter((i) => i.cls === 'state').map((i) => i.source)
  const a: Assessment = {
    verdict: opts.verdict,
    risk: opts.risk,
    reasons: opts.reasons,
    factChecks: opts.fc ?? [],
    coverage: {
      query: 'explosion hormuz vessel', window: '24h', total: sorted.filter((i) => i.cls !== 'social').length,
      domains: new Set(sorted.filter((i) => i.cls !== 'social').map((i) => i.source)).size, countries: [],
      establishedOutlets: [], stateOutlets: [...new Set(state)],
      articles: sorted.filter((i) => i.cls !== 'social').map((i) => ({ url: `#demo-${i.source}`, title: i.title, domain: i.source })),
    },
    signals: sorted.map((i) => ({ platform: i.cls === 'social' ? (i.source.startsWith('t.me') ? 'telegram' : 'bluesky') : 'news', region: i.source, text: i.title, at: new Date(i.at).toISOString() })),
    spread: new Set(sorted.map((i) => i.source)).size,
    markets: opts.market ? [marketRef(0.31, -0.18)] : undefined,
    campaign,
  }
  return {
    id: STORY,
    layerId: 'news',
    title: 'DEMO: Explosion reported near Strait of Hormuz, tanker said to be hit',
    position: HORMUZ,
    geoPrecision: 'inferred',
    geoBasis: 'story mentions "Strait of Hormuz" (place)',
    observedAt: new Date(t0).toISOString(),
    source: { provider: 'demo-script', platform: 'demo', retrievedAt: new Date().toISOString() },
    tags: ['demo', a.verdict, 'news'],
    props: {
      assessment: a, kind: 'news', risk: a.risk, verdict: a.verdict,
      outlets: new Set(sorted.filter((i) => i.cls !== 'social').map((i) => i.source)).size,
      social: sorted.filter((i) => i.cls === 'social').length,
      campaign: opts.score, items: sorted.length, updatedAt: Date.now(),
      ...(opts.network ? { network: opts.network } : {}),
      ...(opts.brief ? { brief: opts.brief } : {}),
    },
  }
}

const market = (p: number, live?: number): Feature => {
  const props: MarketProps & { ring: { t: number; p: number }[] } = {
    kind: 'market', platform: 'polymarket', p, headline: 'Yes', change24h: p - 0.49, changeLive: live, volume24h: 61_000, volumeTotal: 420_000, liquidity: 180_000,
    unit: 'usd', playMoney: false, endDate: new Date(Date.now() + 28 * 86400_000).toISOString(), category: 'Geopolitics',
    outcomes: [{ label: 'Yes', p }, { label: 'No', p: 1 - p }], ref: {}, related: [{ id: STORY, title: 'DEMO: Explosion reported near Strait of Hormuz', outlets: 2, verdict: 'unverified' }], trust: 78,
    ring: Array.from({ length: 40 }, (_, i) => ({ t: Date.now() - (40 - i) * 3600_000, p: i < 36 ? 0.49 + Math.sin(i / 3) * 0.015 : p + (36 - i) * 0.02 })),
  }
  return {
    id: MARKET, layerId: 'markets', title: 'DEMO: US–Iran Hormuz agreement by October 31?', position: { lat: 32.4, lon: 53.7 }, geoPrecision: 'inferred',
    geoBasis: 'question is about "Iran" (country)', observedAt: new Date().toISOString(),
    source: { provider: 'demo-script', platform: 'polymarket', url: 'https://polymarket.com', retrievedAt: new Date().toISOString() },
    tags: ['demo', 'market'], props: props as unknown as Record<string, unknown>,
  }
}

/** Al Jazeera English's real 24/7 channel, pinned at its real base (Doha), about 400 km from the strait. */
const stream = (): Feature => ({
  id: STREAM, layerId: 'livestreams', title: 'DEMO: Al Jazeera English (live), nearest 24/7 regional broadcaster',
  position: { lat: 25.29, lon: 51.53 }, geoPrecision: 'approximate', geoBasis: 'broadcaster base: Doha',
  observedAt: new Date().toISOString(),
  source: { provider: 'demo-script', platform: 'youtube', url: 'https://www.youtube.com/channel/UCNye-wNBqNL5ZzHSJj3l8Bg/live', retrievedAt: new Date().toISOString() },
  media: { kind: 'iframe', url: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1' },
  tags: ['demo', 'news', '24/7'], props: { channel: 'Al Jazeera English', live: true, curated: true },
})

/** Same text posted by three channels within 14 minutes: what the Telegram scouts flag as a coordinated copy. */
const tgPost = (i: number, at: number): Feature => {
  const handles = ['intelslava', 'rybar', 'News_of_Donbass']
  const h = handles[i]
  const cluster = { id: 'tgc:demo', size: i + 1, channels: handles.slice(0, i + 1), first: 'intelslava', firstAt: at - i * 7 * 60_000, leadMin: i * 7 }
  return {
    id: TG[i], layerId: 'telegram',
    title: 'DEMO: ⚡ Tanker hit by explosion in the Strait of Hormuz, US Navy drone suspected',
    position: { lat: HORMUZ.lat + 0.15 * i, lon: HORMUZ.lon - 0.2 * i }, geoPrecision: 'inferred', geoBasis: 'post names "Strait of Hormuz"',
    observedAt: new Date(at).toISOString(),
    source: { provider: 'demo-script', platform: `t.me/${h}`, url: 'https://t.me/s/' + h, retrievedAt: new Date().toISOString() },
    tags: ['demo', 'telegram', 'milblog', ...(i >= 2 ? ['coordinated'] : [])],
    props: {
      handle: h, channel: h, tier: 4, type: 'milblog', bloc: 'RU', topic: 'conflict', lang: 'en', views: [48_000, 31_000, 12_000][i],
      text: 'DEMO: ⚡ Tanker hit by explosion in the Strait of Hormuz, US Navy drone suspected. Video from the scene.',
      cluster, subscribers: [389_000, 1_300_000, 120_000][i],
    },
  }
}

/** The rumour as the entity graph sees it: one event, its sources, actors, claims and the ships nearby. */
function investigationGraph(at: number): { entities: Record<string, Entity>; edges: Record<string, Edge> } {
  const E = (id: string, type: Entity['type'], subtype: string, label: string, extra: Partial<Entity> = {}): Entity => ({ id, type, subtype, label, props: {}, firstSeen: at, lastSeen: at, confidence: 0.8, ...extra })
  const ents: Entity[] = [
    E('event:demo-hormuz', 'event', 'explosion', 'DEMO: Explosion reported near Strait of Hormuz, tanker said to be hit', {
      position: HORMUZ, precision: 'town',
      props: { kind: 'explosion', summary: 'Social accounts and Russian and Iranian government outlets report a tanker hit near the Strait of Hormuz; a fact-check finds the footage is from a 2023 port fire.', read: 'llm' },
      check: { status: 'debunked', reasons: ['Lead Stories rates the footage false (2023 port fire)', 'carried by 2 government outlets (RU, IR), no independent outlet'], sources: 6, independent: 0, countries: 0 },
    }),
    E('location:demo-hormuz', 'location', 'town', 'Strait of Hormuz', { position: HORMUZ, precision: 'town' }),
    E('source:demo-intelslava', 'source', 'channel', 'Intel Slava Z (@intelslava)', { props: { ownership: 'private', bloc: 'RU' } }),
    E('source:demo-disclosetv', 'source', 'channel', 'Disclose.tv (@disclosetv)'),
    E('source:demo-clashreport', 'source', 'channel', 'Clash Report (@ClashReport)'),
    E('source:demo-bsky', 'source', 'account', '@osintwatcher.bsky.social'),
    E('source:demo-tass', 'source', 'outlet', 'tass.com', { props: { ownership: 'state', country: 'RU' } }),
    E('source:demo-presstv', 'source', 'outlet', 'presstv.co.uk', { props: { ownership: 'state', country: 'IR' } }),
    E('source:demo-leadstories', 'source', 'outlet', 'leadstories.com (fact-check)', { props: { ownership: 'private', country: 'US' } }),
    E('actor:demo-us', 'actor', 'military', 'US Armed Forces'),
    E('claim:demo-tass', 'claim', 'assertion', 'TASS: tanker attacked in Hormuz, US blamed', { props: { stance: 'asserts' } }),
    E('claim:demo-fc', 'claim', 'assertion', 'Lead Stories: the video shows a 2023 port fire', { props: { stance: 'asserts' } }),
    E('asset:demo-vessel-1', 'asset', 'vessel', 'Tanker (AIS, 11 kn, normal course)', { position: { lat: HORMUZ.lat + 0.12, lon: HORMUZ.lon + 0.2 }, precision: 'exact' }),
    E('asset:demo-vessel-2', 'asset', 'vessel', 'Cargo ship (AIS, 13 kn, normal course)', { position: { lat: HORMUZ.lat - 0.1, lon: HORMUZ.lon - 0.15 }, precision: 'exact' }),
  ]
  const L = (from: string, rel: Edge['rel'], to: string, role?: Edge['role']): Edge => ({ id: `${from}|${rel}${role ? `:${role}` : ''}|${to}`, from, to, rel, role, at, evidence: [], confidence: 0.8, via: 'llm' })
  const ev = 'event:demo-hormuz'
  const edges: Edge[] = [
    L(ev, 'located_at', 'location:demo-hormuz'),
    ...['intelslava', 'disclosetv', 'clashreport', 'bsky', 'tass', 'presstv'].map((s) => L(ev, 'reported_by', `source:demo-${s}`)),
    L(ev, 'involves', 'actor:demo-us', 'attacker'),
    L('claim:demo-tass', 'about', ev), L('source:demo-tass', 'claims', 'claim:demo-tass'),
    L('claim:demo-fc', 'about', ev), L('source:demo-leadstories', 'claims', 'claim:demo-fc'), L('claim:demo-fc', 'contradicts', 'claim:demo-tass'),
    L(ev, 'near', 'asset:demo-vessel-1'), L(ev, 'near', 'asset:demo-vessel-2'),
  ]
  return { entities: Object.fromEntries(ents.map((e) => [e.id, e])), edges: Object.fromEntries(edges.map((e) => [e.id, e])) }
}

/** Iran's instability score as the index shows it, rising while the rumour spreads. */
const ciiIran = (score: number, delta: number): Feature => ({
  id: CII, layerId: 'cii', title: `DEMO: Iran: ${score}`, position: { lat: 32.4, lon: 53.7 }, geoPrecision: 'exact', geoBasis: 'country (demo replay)',
  observedAt: new Date().toISOString(), source: { provider: 'demo-script', platform: 'panoptes', retrievedAt: new Date().toISOString() }, tags: ['demo', 'cii'],
  props: {
    kind: 'cii', country: 'Iran', score, delta, rank: 2, drivers: 'News & Telegram attention, Flagged narratives, Market moves',
    components: [
      { id: 'conflict', label: 'Clashes & protests', value: 14, points: 7.8, max: 35, detail: 'severity-weighted events (GDELT/ACLED, 24 h)' },
      { id: 'attention', label: 'News & Telegram attention', value: 58, points: 14.9, max: 15, detail: 'stories + posts/3' },
      { id: 'disinfo', label: 'Flagged narratives', value: 3, points: 7.8, max: 10, detail: 'campaign-flagged or contradicted stories' },
      { id: 'outage', label: 'Internet shutdowns & censorship', value: 2, points: 9.5, max: 15, detail: 'outage/censorship signals' },
      { id: 'jamming', label: 'GNSS jamming', value: 6.2, points: 7.9, max: 10, detail: 'jammed cells × intensity' },
      { id: 'markets', label: 'Market moves', value: 2, points: 3.2, max: 5, detail: 'real-money markets moving ≥5 pts/24 h' },
      { id: 'trends', label: 'Search trends', value: 1, points: 3.9, max: 10, detail: 'security terms trending' },
    ],
  },
})

/** Reuse one demo case across runs and refresh its snapshot, so replays don't pile up duplicates. */
async function saveEvidence(feature: Feature) {
  const cases = useCases.getState()
  await cases.refresh()
  const existing = useCases.getState().cases.find((c) => c.title === CASE_TITLE)
  if (existing) await cases.setActive(existing.id)
  else await cases.create(CASE_TITLE)
  for (const item of useCases.getState().open?.items ?? []) if (item.feature_id === feature.id) await cases.remove(item.id)
  await cases.add(feature)
}

const upsert = (feature: Feature, kind: 'new' | 'update', change: string | undefined, source: string): LiveEvent => ({
  type: 'upsert', kind, feature, change, item: { title: feature.title, source, at: Date.now() },
})

/** Pre-baked co-amplification history for the replay: the pair TASS -> Press TV recurs across flagged stories. */
const NETWORK: NetGraph = {
  generatedAt: new Date().toISOString(),
  nodes: [
    { id: 't.me/intelslava', cls: 'social', stories: 9, flagged: 6 },
    { id: 't.me/disclosetv', cls: 'social', stories: 5, flagged: 3 },
    { id: 'bsky:osintwatcher.bsky.social', cls: 'social', stories: 2, flagged: 1 },
    { id: 't.me/clashreport', cls: 'social', stories: 7, flagged: 3 },
    { id: 'tass.com', cls: 'state', bloc: 'RU', stories: 14, flagged: 7 },
    { id: 'presstv.co.uk', cls: 'state', bloc: 'IR', stories: 8, flagged: 5 },
  ],
  edges: [
    { from: 'tass.com', to: 'presstv.co.uk', weight: 5, led: 5, medianLeadMin: 4, recurring: true, stories: [STORY] },
    { from: 't.me/intelslava', to: 'tass.com', weight: 4, led: 4, medianLeadMin: 29, recurring: true, stories: [STORY] },
    { from: 't.me/intelslava', to: 't.me/disclosetv', weight: 3, led: 3, medianLeadMin: 9, recurring: true, stories: [STORY] },
    { from: 't.me/intelslava', to: 't.me/clashreport', weight: 2, led: 2, medianLeadMin: 18, recurring: false, stories: [STORY] },
    { from: 't.me/disclosetv', to: 'bsky:osintwatcher.bsky.social', weight: 1, led: 1, medianLeadMin: 3, recurring: false, stories: [STORY] },
    { from: 't.me/clashreport', to: 'presstv.co.uk', weight: 2, led: 2, medianLeadMin: 16, recurring: false, stories: [STORY] },
  ],
  stories: [{ id: STORY, title: 'DEMO: Explosion reported near Strait of Hormuz', flagged: true }],
}

const BRIEF: Brief = {
  summary: 'Social accounts claimed a tanker was hit near the Strait of Hormuz; Russian and Iranian government outlets repeated it within minutes. Lead Stories has since shown the footage is from a 2023 port fire.',
  whyFlagged: [
    'Started on one Telegram channel and spread to three more accounts before any newsroom reported it.',
    'TASS and Press TV ran it before any independent outlet: consistent with aligned amplification, not proof of it.',
    'A matching fact-check rates the footage false while the story is still circulating.',
  ],
  frames: [
    { actor: 'RU state (TASS)', frame: 'A US-blamed attack on shipping.' },
    { actor: 'IR state (Press TV)', frame: 'A "US-backed" attack on a tanker.' },
    { actor: 'Telegram accounts', frame: 'Breaking, unconfirmed blast with video.' },
  ],
  checkNext: [
    'Check AIS for the named tanker and for vessels loitering near Bandar Abbas.',
    'Watch whether independent outlets correct or drop the story within 6 h.',
    'Track the Polymarket move for reversal once the debunk spreads.',
  ],
  glosses: [],
  model: 'pre-written for the replay (live briefs use Claude)',
  at: new Date().toISOString(),
}

const alertOf = (f: Feature): Feature => ({
  ...f, id: ALERT, layerId: 'watch', tags: [...f.tags, 'watch'],
  props: { ...f.props, originLayer: 'news', originId: STORY, watchId: WATCH.id, watchName: WATCH.name, km: 0, change: 'new story in region', alertedAt: Date.now() },
})

const FC: FactCheckMatch = { publisher: 'Lead Stories', title: 'Video Does NOT Show Explosion At Strait Of Hormuz -- Footage Is From 2023 Port Fire', url: 'https://leadstories.com', date: new Date().toISOString(), verdict: 'false', score: 0.82 }

export async function runDemo(signal: AbortSignal) {
  const d = useDemo.getState()
  const st = useStore.getState
  const say = (step: number, caption: string, sub?: string) => d.set({ step, caption, sub })
  for (const id of ['watch', 'news', 'telegram', 'markets', 'campaigns', 'osint', 'livestreams']) if (!st().layers[id]?.enabled) st().toggle(id)
  const ciiWasOn = !!st().layers.cii?.enabled
  const sensorBefore = useGlobeUi.getState().sensor
  const physical = ['gnss', 'military-air'].filter((id) => st().layers[id] && !st().layers[id].enabled)
  useWatches.setState((w) => ({ list: [...w.list.filter((x) => x.id !== WATCH.id), WATCH] }))
  const prevCase = useCases.getState().activeId
  d.set({ running: true })
  const t0 = T0()
  const at = (min: number) => t0 + min * 60_000
  const S = (min: number, source: string, cls: Src['cls'], title: string, bloc?: string): Src => ({ at: at(min), source, cls, title, bloc })

  const a = S(0, 't.me/intelslava', 'social', 'Explosion heard near Strait of Hormuz, tanker reportedly hit')
  const b = S(9, 't.me/disclosetv', 'social', 'BREAKING: video shows blast at sea off Bandar Abbas')
  const c = S(12, 'bsky:osintwatcher.bsky.social', 'social', 'Hormuz tanker explosion, unconfirmed video')
  const e = S(18, 't.me/clashreport', 'social', 'Reports of attack on vessel in Hormuz')
  const f = S(31, 'tass.com', 'state', 'Tanker attacked in Hormuz, US blamed', 'RU')
  const g = S(34, 'presstv.co.uk', 'state', 'US-backed attack on tanker in Hormuz strait', 'IR')

  try {
    say(1, 'A region watch fires: a rumour starts on Telegram', 'An analyst watches 300 km around the Strait of Hormuz. The first post raises an alert; no news outlet has it yet')
    const first = story({ items: [a], verdict: 'insufficient', risk: 22, score: 5, flags: [FLAG.socialFirst], reasons: ['only social accounts report it so far; no news outlet has covered it yet'] })
    st().applyLive('news', upsert(first, 'new', undefined, a.source))
    st().applyLive('watch', upsert(alertOf(first), 'new', `${WATCH.name} · 0 km · new story in region`, a.source))
    st().select(STORY)
    await sleep(8000, signal)

    say(2, 'Amplification: four accounts across two platforms', 'Social surge flagged, still no independent outlet')
    st().applyLive('news', upsert(story({ items: [a, b, c, e], verdict: 'unverified', risk: 41, score: 25, flags: [FLAG.surge], reasons: ['only social accounts report it so far; no news outlet has covered it yet', 'appears on 4 distinct platform/region feeds'] }), 'update', '+3 social · ⚑ Social surge', b.source))
    await sleep(8000, signal)

    say(3, 'Telegram scouts: the same text on three channels', 'The scout swarm reads ~70 public channels. @intelslava posted first; @rybar and @News_of_Donbass copied it word for word within 14 min: flagged as a coordinated copy')
    for (const i of [0, 1, 2]) {
      st().applyLive('telegram', upsert(tgPost(i, at(i * 7)), 'new', i ? `same text on ${i + 1} channels, first @intelslava` : undefined, `@${['intelslava', 'rybar', 'News_of_Donbass'][i]}`))
      await sleep(1500, signal)
    }
    st().select(TG[2])
    await sleep(7000, signal)
    st().select(STORY)

    say(4, 'Money moves: the market reprices', 'Polymarket “US–Iran Hormuz agreement” −18 pts. People are putting money behind a worse outcome')
    st().applyLive('markets', upsert(market(0.31, -0.18), 'new', 'Yes: 49% → 31% (−18.0 pts)', 'polymarket'))
    st().applyLive('news', upsert(story({ items: [a, b, c, e], verdict: 'unverified', risk: 58, score: 35, flags: [FLAG.surge, FLAG.market], market: true, reasons: ['only social accounts report it so far; no news outlet has covered it yet', 'polymarket prices "US–Iran Hormuz agreement" at 31% (-18 pts/24h) with 78/100 market depth'] }), 'update', '⚑ Market reacting', 'polymarket'))
    await sleep(8000, signal)

    const stateItems = { items: [a, b, c, e, f, g], blocs: ['RU', 'IR'], market: true, network: NETWORK }
    say(5, 'Government outlets pick it up: Russia and Iran', 'TASS and Press TV frame it within minutes, before any independent outlet')
    st().applyLive('news', upsert(story({ ...stateItems, verdict: 'unverified', risk: 81, score: 75, flags: [FLAG.stateFirst, FLAG.bloc, FLAG.surge, FLAG.market], reasons: ['reported only by government-funded outlets so far (2 domains)', 'coverage comes only from government-funded outlets: tass.com (RU), presstv.co.uk (IR)', 'markets treat this as likely while confirmation is still thin: worth a closer look'] }), 'update', '+tass.com · +presstv.co.uk · ⚑ Several governments push it', 'tass.com'))
    await sleep(8000, signal)

    say(6, 'Who amplifies whom: the influence network', 'TASS → Press TV is a recurring pair: same order on 5 flagged stories, Press TV ~4 min behind. The Telegram channel that started it feeds TASS too')
    d.set({ tab: 'network' })
    await sleep(10000, signal)

    say(7, 'The fact-check lands, and the analyst brief writes itself', 'Lead Stories: the footage is from a 2023 port fire. The verdict flips to debunked; the AI brief summarises why and what to check next')
    d.set({ tab: 'timeline' })
    st().applyLive('news', upsert(story({ ...stateItems, verdict: 'debunked', risk: 96, score: 95, fc: [FC], brief: BRIEF, flags: [FLAG.stateFirst, FLAG.bloc, FLAG.surge, FLAG.contradicted, FLAG.market], reasons: ['Lead Stories fact-check rates a matching claim false (82% term match)', 'coverage comes only from government-funded outlets: tass.com (RU), presstv.co.uk (IR)'] }), 'update', 'unverified → debunked · ⚑ Contradicted', 'leadstories.com'))
    await sleep(10000, signal)

    say(8, 'Investigate: the rumour as entities', 'Every report was read and linked: one event, six sources, the claim and the fact-check that contradicts it, and two ships passing normally right where the "hit tanker" should be')
    useInvestigation.setState({ open: true, ...investigationGraph(at(0)), selected: 'event:demo-hormuz', inspect: null, busy: null, error: null })
    void useInvestigation.getState().select('event:demo-hormuz')
    await sleep(11000, signal)
    useInvestigation.setState({ open: false, entities: {}, edges: {}, selected: null, inspect: null })

    say(9, 'Physical signals: does anything on the ground back it up?', 'Thermal look on. Live layers: GPS jamming from yesterday, military aircraft broadcasting now, outages and censorship. Nothing physical confirms a strike; the market keeps its fear premium')
    for (const id of physical) st().toggle(id)
    useGlobeUi.getState().setSensor('flir')
    st().applyLive('markets', upsert(market(0.27, -0.04), 'update', 'Yes: 31% → 27% (−4.0 pts)', 'polymarket'))
    await sleep(9000, signal)

    say(10, 'Country risk: Iran climbs the instability index', 'One explainable score per country from every layer: attention, flagged narratives, shutdowns, jamming, markets. Iran +9 in the last hour')
    useGlobeUi.getState().setSensor('eo')
    if (!st().layers.cii?.enabled) st().toggle('cii')
    st().applyLive('cii', upsert(ciiIran(55, 9), 'new', '▲ 9 in the last hour', 'cii'))
    st().select(CII)
    await sleep(9000, signal)

    say(11, 'Eyes on the region', 'The nearest 24/7 broadcaster plays inside the dashboard. Analysts can watch live coverage without leaving the map')
    st().pin(stream())
    await sleep(9000, signal)
    st().select(STORY)

    say(12, 'Save the evidence', 'A frozen snapshot with the timeline, network, brief and every source goes into the case file')
    const saved = st().layers.news.data?.features.find((x) => x.id === STORY)
    try {
      if (saved) await saveEvidence(saved)
    } catch {
      say(12, 'Save the evidence', 'Case file unavailable: the API server is not running, so this step is skipped')
    }
    await sleep(6000, signal)
    say(13, 'Replay complete', 'Watch → Telegram → money → media → network → verdict → entities → ground truth → country risk → evidence. Demo pins are cleared; the saved case stays in the case file')
    await sleep(6000, signal)
  } catch {
    /* stopped by the user */
  } finally {
    st().removeFeatures('news', [STORY])
    st().removeFeatures('markets', [MARKET])
    st().removeFeatures('livestreams', [STREAM])
    st().removeFeatures('watch', [ALERT])
    st().removeFeatures('telegram', TG)
    st().removeFeatures('cii', [CII])
    if (!ciiWasOn && st().layers.cii?.enabled) st().toggle('cii')
    useGlobeUi.getState().setSensor(sensorBefore)
    if (useInvestigation.getState().entities['event:demo-hormuz']) useInvestigation.setState({ open: false, entities: {}, edges: {}, selected: null, inspect: null })
    useWatches.setState((w) => ({ list: w.list.filter((x) => x.id !== WATCH.id) }))
    for (const id of physical) if (st().layers[id]?.enabled) st().toggle(id)
    if (prevCase && prevCase !== useCases.getState().activeId) void useCases.getState().setActive(prevCase).catch(() => {})
    d.set({ running: false, step: 0, caption: undefined, sub: undefined, tab: undefined })
  }
}
