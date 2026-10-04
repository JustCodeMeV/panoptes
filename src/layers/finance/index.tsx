import type { LayerDef } from '../../core/types'
import { MarketsBoard } from './Board'
import { FinanceDetail } from './Detail'
import { moveColor, pct } from './props'

/** World markets: indices, commodities, currencies, crypto, defence stocks, pinned where they trade or are produced. */
export const finance: LayerDef = {
  id: 'finance',
  label: 'World Markets',
  description: 'Stock indices, oil, gas, gold, wheat, uranium, currencies, crypto and defence stocks, live (Yahoo Finance), pinned where they trade or are produced and coloured by today’s move.',
  color: '#4ade80',
  refreshMs: 5 * 60_000,
  defaultEnabled: false,
  pin: (f) => ({ size: 12 + Math.min(12, Math.abs(Number(f.props.day)) * 3), color: moveColor(Number(f.props.day)), glyph: f.props.shock ? 'alert' : 'chart' }),
  rank: (f) => Math.abs(Number(f.props.day)),
  subtitle: (f) => `${String(f.props.kind)} · today ${pct(f.props.day)} · week ${pct(f.props.week)}`,
  Controls: MarketsBoard,
  Detail: FinanceDetail,
}
