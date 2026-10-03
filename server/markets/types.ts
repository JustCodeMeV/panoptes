import type { MarketOutcome, MarketProps } from '../../shared/markets.ts'

/** What every platform adapter returns. The engine does the rest. */
export type RawMarket = {
  /** Stable: `${platform}:${externalId}` */
  id: string
  platform: MarketProps['platform']
  /** Event/market title shown to the analyst. */
  title: string
  /** The specific question the headline probability answers. */
  headline: string
  url: string
  p: number
  change24h?: number
  volume24h: number
  volumeTotal: number
  liquidity?: number
  unit: MarketProps['unit']
  playMoney: boolean
  endDate?: string
  category?: string
  outcomes: MarketOutcome[]
  ref: MarketProps['ref']
  /** Free text used for topic gating & geolocation (title, description snippet, tags). */
  text: string
}

export const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}
export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export async function getJson<T>(url: string, ms = 25_000): Promise<T> {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 panoptes-research/0.1', accept: 'application/json' }, signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).host}`)
  return (await res.json()) as T
}
