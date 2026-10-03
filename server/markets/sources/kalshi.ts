import { clamp01, getJson, num, type RawMarket } from '../types.ts'

const BASE = 'https://api.elections.kalshi.com/trade-api/v2'
const CATEGORIES = new Set(['World', 'Politics', 'Elections', 'Social', 'Transportation'])

type KMarket = {
  ticker: string
  title?: string
  yes_sub_title?: string
  yes_bid_dollars?: string
  yes_ask_dollars?: string
  last_price_dollars?: string
  previous_price_dollars?: string
  volume_24h_fp?: string
  volume_fp?: string
  open_interest_fp?: string
  liquidity_dollars?: string
  close_time?: string
  status?: string
}
type KEvent = {
  event_ticker: string
  series_ticker: string
  title: string
  sub_title?: string
  category: string
  mutually_exclusive?: boolean
  markets?: KMarket[]
}

const price = (m: KMarket) => {
  const last = num(m.last_price_dollars)
  const bid = num(m.yes_bid_dollars)
  const ask = num(m.yes_ask_dollars)
  return clamp01(bid && ask ? (bid + ask) / 2 : last || bid)
}

function toRaw(e: KEvent): RawMarket | null {
  const live = (e.markets ?? []).filter((m) => m.status === 'active' && price(m) > 0)
  if (!live.length) return null
  const head = [...live].sort((a, b) => (e.mutually_exclusive ? price(b) - price(a) : num(b.volume_24h_fp) - num(a.volume_24h_fp)))[0]
  const label = (m: KMarket) => m.yes_sub_title || m.title || m.ticker
  const prev = num(head.previous_price_dollars)
  return {
    id: `kalshi:${e.event_ticker}`,
    platform: 'kalshi',
    title: e.title,
    headline: live.length === 1 ? 'Yes' : label(head),
    url: `https://kalshi.com/markets/${e.series_ticker.toLowerCase()}`,
    p: price(head),
    change24h: prev ? price(head) - prev : undefined,
    volume24h: live.reduce((n, m) => n + num(m.volume_24h_fp), 0),
    volumeTotal: live.reduce((n, m) => n + num(m.volume_fp), 0),
    liquidity: live.reduce((n, m) => n + num(m.liquidity_dollars), 0) || undefined,
    unit: 'contracts',
    playMoney: false,
    endDate: head.close_time,
    category: e.category,
    outcomes: [...live].sort((a, b) => price(b) - price(a)).slice(0, 6).map((m) => ({ label: label(m), p: price(m), volume: num(m.volume_fp) })),
    ref: { series: e.series_ticker, ticker: head.ticker },
    text: `${e.title} ${e.sub_title ?? ''} ${head.title ?? ''} ${e.category}`,
  }
}

/** Kalshi has no topic filter, so page through open events and keep relevant categories. */
export async function fetchKalshi(): Promise<RawMarket[]> {
  const out: RawMarket[] = []
  let cursor = ''
  for (let i = 0; i < 6; i++) {
    const d = await getJson<{ events: KEvent[]; cursor?: string }>(
      `${BASE}/events?status=open&limit=200&with_nested_markets=true${cursor ? `&cursor=${cursor}` : ''}`,
      40_000,
    )
    for (const e of d.events) {
      if (!CATEGORIES.has(e.category)) continue
      const raw = toRaw(e)
      if (raw) out.push(raw)
    }
    cursor = d.cursor ?? ''
    if (!cursor) break
    await new Promise((r) => setTimeout(r, 400)) // pace the pages: Kalshi rate-limits bursts
  }
  return out
}

export async function kalshiHistory(series: string, ticker: string) {
  const now = Math.floor(Date.now() / 1000)
  const d = await getJson<{ candlesticks: { end_period_ts: number; price: { close_dollars?: string; previous_dollars?: string } }[] }>(
    `${BASE}/series/${series}/markets/${ticker}/candlesticks?start_ts=${now - 7 * 86400}&end_ts=${now}&period_interval=60`,
  )
  return (d.candlesticks ?? [])
    .map((c) => ({ t: c.end_period_ts * 1000, p: num(c.price.close_dollars) || num(c.price.previous_dollars) }))
    .filter((x) => x.p > 0)
}
