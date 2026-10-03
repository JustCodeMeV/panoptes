import type { LayerDef } from '../../core/types'
import { AcledDetail } from './Detail'
import { TYPE_COLOR, str } from './props'

/** Human-coded conflict and protest events (ACLED). Needs a free research account. */
export const acled: LayerDef = {
  id: 'acled',
  label: 'Conflict events (ACLED)',
  description: 'Human-coded battles, strikes, attacks on civilians and protests with actors and fatalities (ACLED, last 14 days; needs an ACLED account).',
  color: '#ef4444',
  refreshMs: 30 * 60_000,
  defaultEnabled: false,
  pin: (f) => ({ size: 16 + Math.min(14, Math.sqrt(Number(f.props.fatalities) || 0) * 3), color: TYPE_COLOR[String(f.props.eventType)], glyph: 'alert' }),
  rank: (f) => Date.parse(f.observedAt) + (Number(f.props.fatalities) || 0) * 3600_000,
  subtitle: (f) => [str(f.props.date), str(f.props.actor1), Number(f.props.fatalities) ? `${String(f.props.fatalities)} killed` : undefined].filter(Boolean).join(' · '),
  Detail: AcledDetail,
}
