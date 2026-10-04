import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'

/**
 * WORLD MARKETS: stock indices, commodities, currencies, crypto and defence,
 * from Yahoo Finance's public chart endpoint (keyless, one call per symbol,
 * 1 month of daily closes). Each instrument is pinned where it trades or is
 * produced, so a commodity shock shows up next to the events that drive it.
 */

type Inst = { sym: string; name: string; kind: 'index' | 'commodity' | 'fx' | 'crypto' | 'defence' | 'volatility'; lat: number; lon: number; where: string; country?: string }
export const INSTRUMENTS: Inst[] = [
  { sym: '^GSPC', name: 'S&P 500', kind: 'index', lat: 40.71, lon: -74.01, where: 'New York', country: 'United States' },
  { sym: '^IXIC', name: 'Nasdaq', kind: 'index', lat: 40.76, lon: -73.98, where: 'New York', country: 'United States' },
  { sym: '^DJI', name: 'Dow Jones', kind: 'index', lat: 40.7, lon: -74.02, where: 'New York', country: 'United States' },
  { sym: '^VIX', name: 'VIX (fear index)', kind: 'volatility', lat: 41.88, lon: -87.63, where: 'Chicago', country: 'United States' },
  { sym: '^FTSE', name: 'FTSE 100', kind: 'index', lat: 51.51, lon: -0.09, where: 'London', country: 'United Kingdom' },
  { sym: '^GDAXI', name: 'DAX', kind: 'index', lat: 50.11, lon: 8.68, where: 'Frankfurt', country: 'Germany' },
  { sym: '^FCHI', name: 'CAC 40', kind: 'index', lat: 48.87, lon: 2.34, where: 'Paris', country: 'France' },
  { sym: '^N225', name: 'Nikkei 225', kind: 'index', lat: 35.68, lon: 139.77, where: 'Tokyo', country: 'Japan' },
  { sym: '^HSI', name: 'Hang Seng', kind: 'index', lat: 22.28, lon: 114.16, where: 'Hong Kong', country: 'China' },
  { sym: '000001.SS', name: 'Shanghai Composite', kind: 'index', lat: 31.23, lon: 121.47, where: 'Shanghai', country: 'China' },
  { sym: '^BSESN', name: 'Sensex', kind: 'index', lat: 18.93, lon: 72.83, where: 'Mumbai', country: 'India' },
  { sym: '^KS11', name: 'KOSPI', kind: 'index', lat: 37.52, lon: 126.92, where: 'Seoul', country: 'South Korea' },
  { sym: '^TWII', name: 'Taiwan Weighted', kind: 'index', lat: 25.03, lon: 121.56, where: 'Taipei', country: 'Taiwan' },
  { sym: '^BVSP', name: 'Bovespa', kind: 'index', lat: -23.55, lon: -46.63, where: 'São Paulo', country: 'Brazil' },
  { sym: '^TA125.TA', name: 'TA-125', kind: 'index', lat: 32.07, lon: 34.79, where: 'Tel Aviv', country: 'Israel' },
  { sym: 'XU100.IS', name: 'BIST 100', kind: 'index', lat: 41.04, lon: 29.0, where: 'Istanbul', country: 'Turkey' },
  { sym: '^TASI.SR', name: 'Tadawul', kind: 'index', lat: 24.71, lon: 46.68, where: 'Riyadh', country: 'Saudi Arabia' },
  { sym: 'BZ=F', name: 'Brent crude', kind: 'commodity', lat: 58.5, lon: 1.5, where: 'North Sea' },
  { sym: 'CL=F', name: 'WTI crude', kind: 'commodity', lat: 35.98, lon: -96.77, where: 'Cushing, Oklahoma' },
  { sym: 'NG=F', name: 'Natural gas (US)', kind: 'commodity', lat: 29.95, lon: -90.07, where: 'Henry Hub, Louisiana' },
  { sym: 'TTF=F', name: 'Natural gas (EU TTF)', kind: 'commodity', lat: 52.37, lon: 4.9, where: 'Amsterdam' },
  { sym: 'GC=F', name: 'Gold', kind: 'commodity', lat: 51.51, lon: -0.08, where: 'London bullion market' },
  { sym: 'SI=F', name: 'Silver', kind: 'commodity', lat: 40.7, lon: -74.0, where: 'COMEX New York' },
  { sym: 'HG=F', name: 'Copper', kind: 'commodity', lat: -22.9, lon: -68.2, where: 'Chile copper belt' },
  { sym: 'ZW=F', name: 'Wheat', kind: 'commodity', lat: 46.5, lon: 32.0, where: 'Black Sea wheat belt' },
  { sym: 'ZC=F', name: 'Corn', kind: 'commodity', lat: 41.6, lon: -93.6, where: 'US corn belt' },
  { sym: 'URA', name: 'Uranium (ETF)', kind: 'commodity', lat: 48.0, lon: 66.9, where: 'Kazakhstan uranium' },
  { sym: 'EURUSD=X', name: 'EUR / USD', kind: 'fx', lat: 50.11, lon: 8.68, where: 'Frankfurt (ECB)' },
  { sym: 'GBPUSD=X', name: 'GBP / USD', kind: 'fx', lat: 51.51, lon: -0.09, where: 'London' },
  { sym: 'USDJPY=X', name: 'USD / JPY', kind: 'fx', lat: 35.68, lon: 139.76, where: 'Tokyo' },
  { sym: 'USDCNY=X', name: 'USD / CNY', kind: 'fx', lat: 39.9, lon: 116.4, where: 'Beijing' },
  { sym: 'USDRUB=X', name: 'USD / RUB', kind: 'fx', lat: 55.75, lon: 37.62, where: 'Moscow' },
  { sym: 'USDTRY=X', name: 'USD / TRY', kind: 'fx', lat: 39.93, lon: 32.86, where: 'Ankara' },
  { sym: 'USDILS=X', name: 'USD / ILS', kind: 'fx', lat: 31.77, lon: 35.21, where: 'Jerusalem' },
  { sym: 'USDINR=X', name: 'USD / INR', kind: 'fx', lat: 28.61, lon: 77.21, where: 'New Delhi' },
  { sym: 'USDUAH=X', name: 'USD / UAH', kind: 'fx', lat: 50.45, lon: 30.52, where: 'Kyiv' },
  { sym: 'BTC-USD', name: 'Bitcoin', kind: 'crypto', lat: 47.37, lon: 8.54, where: 'global (pinned at Zug)' },
  { sym: 'ETH-USD', name: 'Ether', kind: 'crypto', lat: 47.17, lon: 8.52, where: 'global (pinned at Zug)' },
  { sym: 'ITA', name: 'US aerospace & defence (ETF)', kind: 'defence', lat: 38.87, lon: -77.06, where: 'Arlington (Pentagon)' },
  { sym: 'EUAD', name: 'European defence (ETF)', kind: 'defence', lat: 50.85, lon: 4.35, where: 'Brussels' },
]

type Quote = { price: number; prev: number; closes: number[]; currency: string; at: number }
const last = new Map<string, Quote>()

async function quote(sym: string, signal: AbortSignal): Promise<Quote> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`, { headers: { 'user-agent': 'Mozilla/5.0' }, signal })
  if (!r.ok) throw new Error(`HTTP ${r.status} finance.yahoo.com`)
  const j = (await r.json()) as { chart: { result?: { meta: { regularMarketPrice: number; chartPreviousClose: number; currency: string; regularMarketTime: number }; indicators: { quote: { close: (number | null)[] }[] } }[] } }
  const res = j.chart.result?.[0]
  if (!res) throw new Error('no data')
  const closes = res.indicators.quote[0].close.filter((x): x is number => x !== null)
  // Previous trading day close: the last close before today's, not the start of the range.
  const prev = closes.length >= 2 ? closes[closes.length - 2] : res.meta.chartPreviousClose
  return { price: res.meta.regularMarketPrice, prev, closes, currency: res.meta.currency, at: res.meta.regularMarketTime * 1000 }
}

const pctOf = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0)

export const financeProvider: Provider = {
  id: 'yahoo-finance',
  layerId: 'finance',
  ttlMs: 10 * 60_000,
  async fetch({ signal }) {
    const queue = [...INSTRUMENTS]
    let failed = 0
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let i = queue.shift(); i; i = queue.shift()) {
          try {
            last.set(i.sym, await quote(i.sym, signal))
          } catch {
            failed++
          }
        }
      }),
    )
    if (!last.size) throw new Error(`HTTP 429 finance.yahoo.com (all ${failed} symbols failed)`)
    const now = new Date().toISOString()
    const out: Feature[] = []
    for (const i of INSTRUMENTS) {
      const q = last.get(i.sym)
      if (!q) continue
      const day = pctOf(q.price, q.prev)
      const week = q.closes.length > 5 ? pctOf(q.price, q.closes[q.closes.length - 6]) : undefined
      const month = q.closes.length ? pctOf(q.price, q.closes[0]) : undefined
      out.push({
        id: `finance:${i.sym}`,
        layerId: 'finance',
        title: `${i.name} ${day >= 0 ? '▲' : '▼'} ${Math.abs(day).toFixed(2)}%`,
        position: { lat: i.lat, lon: i.lon },
        geoPrecision: 'approximate',
        geoBasis: `${i.kind === 'commodity' ? 'production / trading hub' : 'exchange'}: ${i.where}`,
        observedAt: new Date(q.at).toISOString(),
        source: { provider: 'yahoo-finance', platform: 'finance.yahoo.com', url: `https://finance.yahoo.com/quote/${encodeURIComponent(i.sym)}`, retrievedAt: now },
        tags: ['finance', i.kind],
        props: { kind: i.kind, sym: i.sym, name: i.name, country: i.country, price: q.price, currency: q.currency, day, week, month, closes: q.closes.slice(-22), shock: Math.abs(day) >= 3 },
      })
    }
    return out
  },
}
