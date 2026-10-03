import type { Feature } from '../../shared/feature'
import type { LiveEvent } from '../../shared/live'
import type { MarketProps } from '../../shared/markets'
import type { Assessment, Campaign, CampaignFlag, FactCheckMatch } from '../../shared/truth'
import { useCases } from '../core/cases'
import { useDemo } from '../core/demo'
import { useStore } from '../core/store'

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
/** Number of narrated steps; the banner shows "step n/STEPS". */
export const STEPS = 9

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
  socialFirst: { id: 'social-first', label: 'Social-first', severity: 'info', detail: 'first seen on t.me/intelslava, no established outlet yet' },
  surge: { id: 'social-surge', label: 'Social surge', severity: 'warn', detail: '4 distinct social accounts/channels amplify it with no established outlet' },
  stateFirst: { id: 'state-first', label: 'State media first', severity: 'warn', detail: 'tass.com ran it with no established outlet confirming' },
  bloc: { id: 'multi-bloc', label: 'Aligned state outlets', severity: 'alert', detail: 'outlets from RU + IR carry the same story' },
  contradicted: { id: 'contradicted', label: 'Contradicted', severity: 'alert', detail: 'a published fact-check rates a matching claim false while the story is still circulating' },
  market: { id: 'market', label: 'Market reacting', severity: 'info', detail: 'a related prediction market moved sharply' },
} satisfies Record<string, CampaignFlag>

const marketRef = (p: number, d: number) => ({
  id: MARKET, platform: 'polymarket' as const, title: 'US–Iran Hormuz agreement by October 31?', headline: 'Yes', url: 'https://polymarket.com',
  p, change24h: d, volume: 420_000, unit: 'usd' as const, playMoney: false, trust: 78,
})

function story(opts: { items: Src[]; verdict: Assessment['verdict']; risk: number; reasons: string[]; flags: CampaignFlag[]; score: number; blocs?: string[]; fc?: FactCheckMatch[]; market?: boolean; est?: number }): Feature {
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

const FC: FactCheckMatch = { publisher: 'Lead Stories', title: 'Video Does NOT Show Explosion At Strait Of Hormuz -- Footage Is From 2023 Port Fire', url: 'https://leadstories.com', date: new Date().toISOString(), verdict: 'false', score: 0.82 }

export async function runDemo(signal: AbortSignal) {
  const d = useDemo.getState()
  const st = useStore.getState
  const say = (step: number, caption: string, sub?: string) => d.set({ step, caption, sub })
  for (const id of ['news', 'markets', 'campaigns', 'osint', 'livestreams']) if (!st().layers[id]?.enabled) st().toggle(id)
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
    say(1, 'A rumour starts on Telegram', 'Social-first: no news outlet has it yet')
    st().applyLive('news', upsert(story({ items: [a], verdict: 'insufficient', risk: 22, score: 5, flags: [FLAG.socialFirst], reasons: ['only social accounts report it so far; no news outlet has covered it yet'] }), 'new', undefined, a.source))
    st().select(STORY)
    await sleep(8000, signal)

    say(2, 'Amplification: four accounts across two platforms', 'Social surge flagged, still no established outlet')
    st().applyLive('news', upsert(story({ items: [a, b, c, e], verdict: 'unverified', risk: 41, score: 25, flags: [FLAG.surge], reasons: ['only social accounts report it so far; no news outlet has covered it yet', 'appears on 4 distinct platform/region feeds'] }), 'update', '+3 social · ⚑ Social surge', b.source))
    await sleep(8000, signal)

    say(3, 'Money moves: the market reprices', 'Polymarket “US–Iran Hormuz agreement” −18 pts. People are putting money behind a worse outcome')
    st().applyLive('markets', upsert(market(0.31, -0.18), 'new', 'Yes: 49% → 31% (−18.0 pts)', 'polymarket'))
    st().applyLive('news', upsert(story({ items: [a, b, c, e], verdict: 'unverified', risk: 58, score: 35, flags: [FLAG.surge, FLAG.market], market: true, reasons: ['only social accounts report it so far; no news outlet has covered it yet', 'polymarket prices "US–Iran Hormuz agreement" at 31% (-18 pts/24h) with 78/100 market depth'] }), 'update', '⚑ Market reacting', 'polymarket'))
    await sleep(8000, signal)

    say(4, 'State media pick it up: Russia and Iran align', 'TASS and Press TV frame it within minutes, before any established outlet')
    st().applyLive('news', upsert(story({ items: [a, b, c, e, f, g], verdict: 'unverified', risk: 81, score: 75, blocs: ['RU', 'IR'], flags: [FLAG.stateFirst, FLAG.bloc, FLAG.surge, FLAG.market], market: true, reasons: ['reported only by state-affiliated outlets so far (2 domains)', 'coverage comes only from state-affiliated outlets: tass.com, presstv.co.uk', 'markets treat this as likely while confirmation is still thin: worth a closer look'] }), 'update', '+tass.com · +presstv.co.uk · ⚑ Aligned state outlets', 'tass.com'))
    await sleep(9000, signal)

    say(5, 'The fact-check lands', 'Lead Stories: the footage is from a 2023 port fire. The system flags the campaign as contradicted')
    st().applyLive('news', upsert(story({ items: [a, b, c, e, f, g], verdict: 'debunked', risk: 96, score: 95, blocs: ['RU', 'IR'], fc: [FC], flags: [FLAG.stateFirst, FLAG.bloc, FLAG.surge, FLAG.contradicted, FLAG.market], market: true, reasons: ['Lead Stories fact-check rates a matching claim false (82% term match)', 'coverage comes only from state-affiliated outlets: tass.com, presstv.co.uk'] }), 'update', 'unverified → debunked · ⚑ Contradicted', 'leadstories.com'))
    await sleep(8000, signal)

    say(6, 'Physical signals: does anything on the ground back it up?', 'No outage, no disaster alert, no ship-tracking anomaly in the OSINT layer. The market, meanwhile, keeps its fear premium')
    st().applyLive('markets', upsert(market(0.27, -0.04), 'update', 'Yes: 31% → 27% (−4.0 pts)', 'polymarket'))
    await sleep(8000, signal)

    say(7, 'Eyes on the region', 'The nearest 24/7 broadcaster plays inside the dashboard. Analysts can watch live coverage without leaving the map')
    st().pin(stream())
    await sleep(9000, signal)
    st().select(STORY)

    say(8, 'Save the evidence', 'A frozen snapshot with the timeline and every source goes into the case file')
    const saved = st().layers.news.data?.features.find((x) => x.id === STORY)
    try {
      if (saved) await saveEvidence(saved)
    } catch {
      say(8, 'Save the evidence', 'Case file unavailable: the API server is not running, so this step is skipped')
    }
    await sleep(6000, signal)
    say(9, 'Replay complete', 'Claim → money → media → campaign pattern → verdict → evidence. Demo pins are cleared; the saved case stays in the case file')
    await sleep(6000, signal)
  } catch {
    /* stopped by the user */
  } finally {
    st().removeFeatures('news', [STORY])
    st().removeFeatures('markets', [MARKET])
    st().removeFeatures('livestreams', [STREAM])
    if (prevCase && prevCase !== useCases.getState().activeId) void useCases.getState().setActive(prevCase).catch(() => {})
    d.set({ running: false, step: 0, caption: undefined, sub: undefined })
  }
}
