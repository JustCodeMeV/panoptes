import { clamp01, getJson, num, type RawMarket } from '../types.ts'

const TERMS = ['war', 'invasion', 'ceasefire', 'nuclear', 'Iran', 'Ukraine', 'Taiwan', 'coup', 'Russia', 'Israel', 'China', 'NATO', 'missile']

type MfMarket = {
  id: string
  question: string
  url: string
  probability?: number
  outcomeType: string
  volume24Hours?: number
  volume?: number
  totalLiquidity?: number
  closeTime?: number
  isResolved?: boolean
}

/** Manifold is PLAY MONEY: included for breadth, flagged, and excluded from verdict weighting. */
export async function fetchManifold(): Promise<RawMarket[]> {
  const pages = await Promise.allSettled(
    TERMS.map((t) => getJson<MfMarket[]>(`https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(t)}&limit=15&sort=24-hour-vol&filter=open&contractType=BINARY`)),
  )
  if (pages.every((p) => p.status === 'rejected')) throw new Error(String((pages[0] as PromiseRejectedResult).reason))
  const seen = new Map<string, RawMarket>()
  for (const p of pages) {
    if (p.status !== 'fulfilled') continue
    for (const m of p.value) {
      if (m.outcomeType !== 'BINARY' || m.isResolved || m.probability == null || seen.has(m.id)) continue
      seen.set(m.id, {
        id: `manifold:${m.id}`,
        platform: 'manifold',
        title: m.question,
        headline: 'Yes',
        url: m.url,
        p: clamp01(m.probability),
        volume24h: num(m.volume24Hours),
        volumeTotal: num(m.volume),
        liquidity: num(m.totalLiquidity) || undefined,
        unit: 'mana',
        playMoney: true,
        endDate: m.closeTime ? new Date(m.closeTime).toISOString() : undefined,
        outcomes: [{ label: 'Yes', p: clamp01(m.probability) }],
        ref: { contractId: m.id },
        text: m.question,
      })
    }
  }
  return [...seen.values()]
}
