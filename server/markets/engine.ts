import type { Feature, LayerResponse, ProviderStatus } from '../../shared/feature.ts'
import type { HistoryPoint, MarketProps } from '../../shared/markets.ts'
import type { LiveEvent } from '../../shared/live.ts'
import { eventsPerMin, publish, registerStream } from '../core/hub.ts'
import { registerMarkets, relatedStories } from '../core/xref.ts'
import { tokenSet } from '../truth/text.ts'
import { gate, locateMarket } from './gate.ts'
import { fetchKalshi, kalshiHistory } from './sources/kalshi.ts'
import { fetchManifold } from './sources/manifold.ts'
import { fetchPolymarket, polymarketHistory } from './sources/polymarket.ts'
import type { RawMarket } from './types.ts'

export const LAYER_ID = 'markets'
const MOVE_MIN = 0.02 // 2 probability points between polls
/** Per-platform caps so a low-trust platform can never crowd out the rest (or vice versa). */
const CAP: Record<string, number> = { polymarket: 130, kalshi: 60, manifold: 40 }

type Entry = { raw: RawMarket; feature: Feature; tokens: Set<string>; ring: HistoryPoint[]; relatedIds: string }
const entries = new Map<string, Entry>()
const status = new Map<string, ProviderStatus>()
const primed = new Set<string>()

/** 0..100 weight a price deserves, from how much money is behind it. */
export function trust(m: RawMarket): number {
  if (m.playMoney) return Math.min(20, Math.round(Math.log10(m.volumeTotal + 1) * 4))
  // 1k total ~ 0, 100k ~ 35, 10M ~ 70.  100 traded in 24h ~ 0, 1M ~ 30.
  const total = Math.max(0, (Math.log10(m.volumeTotal + 1) - 3) / 4) * 70
  const day = Math.max(0, (Math.log10(m.volume24h + 1) - 2) / 4) * 30
  return Math.round(Math.min(100, total + day))
}

function build(raw: RawMarket, ring: HistoryPoint[], changeLive?: number): { feature: Feature; tokens: Set<string> } {
  const tokens = tokenSet(`${raw.title} ${raw.headline}`)
  const related = relatedStories(tokens)
  const loc = locateMarket(raw.title, raw.headline)
  const props: MarketProps = {
    kind: 'market',
    platform: raw.platform,
    p: raw.p,
    headline: raw.headline,
    change24h: raw.change24h,
    changeLive,
    volume24h: raw.volume24h,
    volumeTotal: raw.volumeTotal,
    liquidity: raw.liquidity,
    unit: raw.unit,
    playMoney: raw.playMoney,
    endDate: raw.endDate,
    category: raw.category,
    outcomes: raw.outcomes,
    ref: raw.ref,
    related,
    trust: trust(raw),
  }
  const now = new Date().toISOString()
  return {
    tokens,
    feature: {
      id: `${LAYER_ID}:${raw.id}`,
      layerId: LAYER_ID,
      title: raw.title,
      position: loc ? { lat: loc.lat, lon: loc.lon } : undefined,
      geoPrecision: loc ? 'inferred' : 'none',
      geoBasis: loc ? `question is about "${loc.name}" (${loc.kind})` : 'no location named in the question',
      observedAt: now,
      source: { provider: raw.platform, platform: raw.platform, url: raw.url, retrievedAt: now },
      tags: ['market', raw.platform, ...(raw.category ? [raw.category] : []), ...(raw.playMoney ? ['play-money'] : [])],
      props: { ...props, ring: ring.slice(-60) } as Record<string, unknown>,
    },
  }
}

const pct = (p: number) => `${Math.round(p * 100)}%`
const pts = (d: number) => `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)} pts`

/** Applies one platform's fresh poll: updates state, emits moves/new/removed. */
function apply(platform: string, raws: RawMarket[]) {
  const silent = !primed.has(platform)
  const kept = raws
    .filter((r) => gate(r.text, r.title).pass && (r.playMoney ? r.volumeTotal >= 2_000 || r.volume24h >= 20 : r.volumeTotal >= 5_000 || r.volume24h >= 500))
    .sort((a, b) => b.volume24h + b.volumeTotal * 0.01 - (a.volume24h + a.volumeTotal * 0.01))
    .slice(0, CAP[platform] ?? 60)
  const live = new Set<string>()
  const t = Date.now()

  for (const raw of kept) {
    live.add(raw.id)
    const prev = entries.get(raw.id)
    const ring = [...(prev?.ring ?? []), { t, p: raw.p }].slice(-120)
    const delta = prev ? raw.p - prev.raw.p : 0
    const moved = !!prev && Math.abs(delta) >= MOVE_MIN
    const { feature, tokens } = build(raw, ring, moved ? delta : undefined)
    const relatedIds = (feature.props.related as { id: string }[]).map((r) => r.id).join(',')
    const newlyLinked = !!prev && relatedIds !== prev.relatedIds && (feature.props.related as unknown[]).length > (prev.feature.props.related as unknown[]).length
    entries.set(raw.id, { raw, feature, tokens, ring, relatedIds })

    if (silent) continue
    if (!prev) {
      publish(LAYER_ID, { type: 'upsert', kind: 'new', feature, change: `opens at ${pct(raw.p)}`, item: { title: raw.title, source: raw.platform, at: t } })
    } else if (moved) {
      publish(LAYER_ID, {
        type: 'upsert',
        kind: 'update',
        feature,
        change: `${raw.headline}: ${pct(prev.raw.p)} → ${pct(raw.p)} (${pts(delta)})`,
        item: { title: raw.title, source: raw.platform, at: t },
      })
    } else if (newlyLinked) {
      const r = (feature.props.related as { title: string }[])[0]
      publish(LAYER_ID, { type: 'upsert', kind: 'update', feature, change: `news linked: ${r.title.slice(0, 60)}`, item: { title: raw.title, source: raw.platform, at: t } })
    }
  }

  const gone: string[] = []
  for (const [id, e] of entries) if (e.raw.platform === platform && !live.has(id)) gone.push(id)
  for (const id of gone) entries.delete(id)
  if (gone.length && !silent) publish(LAYER_ID, { type: 'remove', ids: gone.map((id) => `${LAYER_ID}:${id}`) })

  primed.add(platform)
}

export const snapshot = (): LayerResponse => ({
  layerId: LAYER_ID,
  generatedAt: new Date().toISOString(),
  features: [...entries.values()].map((e) => e.feature),
  providers: [...status.values()],
})
const heartbeat = (): LiveEvent => ({ type: 'status', at: Date.now(), providers: [...status.values()], eventsPerMin: eventsPerMin(LAYER_ID) })

registerStream(LAYER_ID, { snapshot, heartbeat })
registerMarkets(() =>
  [...entries.values()].map((e) => ({
    id: e.feature.id,
    platform: e.raw.platform,
    title: e.raw.title,
    headline: e.raw.headline,
    url: e.raw.url,
    p: e.raw.p,
    change24h: e.raw.change24h,
    volume: e.raw.volume24h || e.raw.volumeTotal,
    unit: e.raw.unit,
    playMoney: e.raw.playMoney,
    trust: Number(e.feature.props.trust),
    tokens: e.tokens,
  })),
)

export async function marketHistory(featureId: string): Promise<{ points: HistoryPoint[]; source: string } | null> {
  const e = [...entries.values()].find((x) => x.feature.id === featureId)
  if (!e) return null
  const { ref, platform } = e.raw
  try {
    if (platform === 'polymarket' && ref.tokenId) return { points: await polymarketHistory(ref.tokenId), source: 'polymarket CLOB, 1 week' }
    if (platform === 'kalshi' && ref.series && ref.ticker) return { points: await kalshiHistory(ref.series, ref.ticker), source: 'kalshi candlesticks, 1 week' }
  } catch (err) {
    console.warn(`[markets] history ${featureId}: ${err instanceof Error ? err.message : err}`)
  }
  return { points: e.ring, source: 'recorded by Panoptes since start-up' }
}

// ---------- polling ----------

const SOURCES: { id: string; every: number; run: () => Promise<RawMarket[]> }[] = [
  { id: 'polymarket', every: 60_000, run: fetchPolymarket },
  { id: 'kalshi', every: 180_000, run: fetchKalshi },
  { id: 'manifold', every: 240_000, run: fetchManifold },
]

let started = false
export function startMarketsEngine() {
  if (started) return
  started = true
  for (const src of SOURCES) {
    const tick = async () => {
      const t0 = Date.now()
      try {
        const raws = await src.run()
        apply(src.id, raws)
        const count = [...entries.values()].filter((e) => e.raw.platform === src.id).length
        status.set(src.id, { id: src.id, ok: true, count, ms: Date.now() - t0 })
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        console.warn(`[markets:${src.id}] ${error}`)
        status.set(src.id, { id: src.id, ok: false, count: 0, error, ms: Date.now() - t0 })
      }
    }
    void tick().then(() => console.log(`[markets] ${src.id}: ${[...entries.values()].filter((e) => e.raw.platform === src.id).length} markets`))
    setInterval(() => void tick(), src.every)
  }
}
