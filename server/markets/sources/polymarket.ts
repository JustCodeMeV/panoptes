import { clamp01, getJson, num, type RawMarket } from '../types.ts'

// Security-relevant tag pages. Overlap is heavy, so events are deduped by id.
const TAGS = ['geopolitics', 'middle-east', 'ukraine', 'china', 'military', 'russia', 'iran', 'israel', 'world']

type PmMarket = {
  id: string
  question: string
  groupItemTitle?: string
  outcomes?: string
  outcomePrices?: string
  volume24hr?: number
  volumeNum?: number
  liquidityNum?: number
  oneDayPriceChange?: number
  endDate?: string
  clobTokenIds?: string
  closed?: boolean
  active?: boolean
  lastTradePrice?: number
}
type PmEvent = {
  id: string
  title: string
  slug: string
  description?: string
  endDate?: string
  negRisk?: boolean
  volume24hr?: number
  volume?: number
  liquidity?: number
  markets?: PmMarket[]
  tags?: { label: string }[]
}

const parseArr = (s?: string): string[] => {
  try {
    return s ? (JSON.parse(s) as string[]) : []
  } catch {
    return []
  }
}
const yes = (m: PmMarket) => num(parseArr(m.outcomePrices)[0])

function toRaw(e: PmEvent): RawMarket | null {
  const live = (e.markets ?? []).filter((m) => m.active !== false && !m.closed && parseArr(m.outcomePrices).length >= 2)
  if (!live.length) return null
  const byVol = [...live].sort((a, b) => num(b.volume24hr) - num(a.volume24hr) || num(b.volumeNum) - num(a.volumeNum))
  // Winner-take-all events: headline = current favourite. Date ladders / singles: busiest market.
  const head = e.negRisk && live.length > 1 ? [...live].sort((a, b) => yes(b) - yes(a))[0] : byVol[0]
  const label = (m: PmMarket) => m.groupItemTitle || m.question
  const single = live.length === 1
  const outcomes = [...live]
    .sort((a, b) => (e.negRisk ? yes(b) - yes(a) : num(b.volumeNum) - num(a.volumeNum)))
    .slice(0, 6)
    .map((m) => ({ label: label(m), p: clamp01(yes(m)), volume: num(m.volumeNum) }))
  const p = clamp01(yes(head))
  return {
    id: `polymarket:${e.id}`,
    platform: 'polymarket',
    title: e.title,
    headline: single ? (parseArr(head.outcomes)[0] === 'Yes' ? 'Yes' : label(head)) : label(head),
    url: `https://polymarket.com/event/${e.slug}`,
    p,
    change24h: head.oneDayPriceChange == null ? undefined : num(head.oneDayPriceChange),
    volume24h: num(e.volume24hr) || live.reduce((n, m) => n + num(m.volume24hr), 0),
    volumeTotal: num(e.volume) || live.reduce((n, m) => n + num(m.volumeNum), 0),
    liquidity: num(e.liquidity) || undefined,
    unit: 'usd',
    playMoney: false,
    endDate: head.endDate ?? e.endDate,
    category: e.tags?.find((t) => ['Geopolitics', 'World', 'Politics', 'Middle East', 'Ukraine'].includes(t.label))?.label,
    outcomes,
    ref: { tokenId: parseArr(head.clobTokenIds)[0] },
    text: `${e.title} ${head.question} ${(e.description ?? '').slice(0, 300)} ${(e.tags ?? []).map((t) => t.label).join(' ')}`,
  }
}

export async function fetchPolymarket(): Promise<RawMarket[]> {
  const pages = await Promise.allSettled(
    TAGS.map((tag) =>
      getJson<PmEvent[]>(`https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=${tag}&order=volume24hr&ascending=false&limit=80`),
    ),
  )
  if (pages.every((p) => p.status === 'rejected')) throw new Error(String((pages[0] as PromiseRejectedResult).reason))
  const seen = new Map<string, RawMarket>()
  for (const p of pages) {
    if (p.status !== 'fulfilled') continue
    for (const e of p.value) {
      const raw = toRaw(e)
      if (raw && !seen.has(raw.id)) seen.set(raw.id, raw)
    }
  }
  return [...seen.values()]
}

export type PricePoint = { t: number; p: number }
export async function polymarketHistory(tokenId: string): Promise<PricePoint[]> {
  const d = await getJson<{ history: { t: number; p: number }[] }>(`https://clob.polymarket.com/prices-history?market=${tokenId}&interval=1w&fidelity=60`)
  return (d.history ?? []).map((h) => ({ t: h.t * 1000, p: h.p }))
}
