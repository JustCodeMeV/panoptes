import type { LayerDef } from '../../core/types'
import { CiiDetail } from './Detail'
import { band } from './props'

/** Country Instability Index: one transparent score per country from every other layer. */
export const cii: LayerDef = {
  id: 'cii',
  label: 'Instability index',
  description:
    'Per-country 0-100 score from live clashes and protests, news and Telegram attention, flagged narratives, internet shutdowns, GNSS jamming, market moves and search trends. Explainable, not a forecast.',
  color: '#f97316',
  refreshMs: 120_000,
  defaultEnabled: false,
  pin: (f) => ({ size: 16, color: band(Number(f.props.score)).color }),
  shape: (f) => {
    const s = Number(f.props.score)
    return { color: band(s).color, alpha: 0.12 + Math.min(0.45, s / 160), width: 1 }
  },
  rank: (f) => Number(f.props.score),
  subtitle: (f) => {
    const d = f.props.delta === undefined ? '' : Number(f.props.delta) > 0 ? ` · ▲${String(f.props.delta)}` : Number(f.props.delta) < 0 ? ` · ▼${Math.abs(Number(f.props.delta))}` : ''
    return `${band(Number(f.props.score)).label}${d}${f.props.drivers ? ` · ${String(f.props.drivers)}` : ''}`
  },
  Detail: CiiDetail,
}
