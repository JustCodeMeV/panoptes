/**
 * Prediction-market types, shared by server and client.
 * A market's price is a probability backed by real money (except play-money
 * platforms), which makes it an independent signal, but a thin or manipulable
 * market is noise: always show volume/liquidity next to the number.
 */
export type MarketUnit = 'usd' | 'contracts' | 'mana'

export type MarketOutcome = { label: string; p: number; volume?: number }

export type MarketProps = {
  kind: 'market'
  platform: 'polymarket' | 'kalshi' | 'manifold'
  /** Probability (0..1) of the headline outcome. */
  p: number
  headline: string
  /** Change in `p` over ~24h, in probability points (0..1), if the platform reports it. */
  change24h?: number
  /** Change since our last poll; drives the live wire. */
  changeLive?: number
  volume24h: number
  volumeTotal: number
  liquidity?: number
  unit: MarketUnit
  playMoney: boolean
  endDate?: string
  category?: string
  outcomes: MarketOutcome[]
  /** Platform-specific ids for history lookups. */
  ref: { tokenId?: string; series?: string; ticker?: string; contractId?: string }
  /** News stories that look like they are about the same thing. */
  related: { id: string; title: string; outlets: number; verdict: string }[]
  /** 0..100: how much weight the number deserves (volume/liquidity based). */
  trust: number
}

/** Compact reference embedded in news assessments. */
export type MarketRef = {
  id: string
  platform: MarketProps['platform']
  title: string
  headline: string
  url?: string
  p: number
  change24h?: number
  volume: number
  unit: MarketUnit
  playMoney: boolean
  trust: number
}

export type HistoryPoint = { t: number; p: number }
