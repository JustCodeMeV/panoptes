import type { LayerDef } from '../../core/types'
import { MarketDetail } from './Detail'
import { marketOf, moveColor, pct, pts } from './format'

const BASE = '#10b981'

/** Prediction markets: what people with money on the line expect to happen. */
export const markets: LayerDef = {
  id: 'markets',
  label: 'Markets',
  description: 'Polymarket, Kalshi and Manifold odds on conflict, security and politics. Money-backed probabilities, updated live.',
  color: BASE,
  refreshMs: 0,
  stream: '/api/stream/markets',
  defaultEnabled: true,
  pin: (f) => {
    const m = marketOf(f)
    const move = Math.abs(m.change24h ?? 0) >= 0.05 || Math.abs(m.changeLive ?? 0) >= 0.02
    return {
      size: Math.round(18 + (m.trust / 100) * 14),
      color: move ? '#f59e0b' : m.playMoney ? '#64748b' : BASE,
      glyph: 'chart',
    }
  },
  rank: (f) => {
    const m = marketOf(f)
    return m.trust + Math.abs(m.change24h ?? 0) * 200 + (m.playMoney ? -50 : 0)
  },
  subtitle: (f) => {
    const m = marketOf(f)
    const ch = m.change24h ? ` · ${pts(m.change24h)}/24h` : ''
    return `${m.platform} · ${m.headline.length > 28 ? '' : `${m.headline} `}${pct(m.p)}${ch}`
  },
  seed: (fs) =>
    [...fs]
      .filter((f) => marketOf(f).trust >= 35 && Math.abs(marketOf(f).change24h ?? 0) > 0)
      .sort((a, b) => Math.abs(marketOf(b).change24h ?? 0) - Math.abs(marketOf(a).change24h ?? 0))
      .slice(0, 5),
  ticker: (f, e) => {
    const m = marketOf(f)
    const d = m.changeLive ?? m.change24h ?? 0
    return {
      badge: e.kind === 'new' ? 'MARKET' : d ? pts(d) : 'LINKED',
      color: d ? moveColor(d) : BASE,
      detail: e.change ?? (m.change24h ? `${m.platform} ${pct(m.p)} · ${pts(m.change24h)}/24h` : `${m.platform} ${pct(m.p)}`),
    }
  },
  Detail: MarketDetail,
}
