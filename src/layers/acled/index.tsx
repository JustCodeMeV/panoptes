import type { LayerDef } from '../../core/types'
import { AcledDetail } from './Detail'
import { TYPE_COLOR, str } from './props'

/** Human-coded conflict events: ACLED when the account has API access, Wikipedia Current Events always. */
export const acled: LayerDef = {
  id: 'acled',
  label: 'Conflict Events',
  description:
    'Human-curated armed clashes, attacks and disasters with sources: Wikipedia Current Events (last 3 days, always on) and ACLED battles/protests with actors and fatalities (when the ACLED account has API access).',
  color: '#ef4444',
  refreshMs: 30 * 60_000,
  defaultEnabled: true,
  pin: (f) => ({ size: 16 + Math.min(14, Math.sqrt(Number(f.props.fatalities) || 0) * 3), color: TYPE_COLOR[String(f.props.eventType)], glyph: 'alert' }),
  rank: (f) => Date.parse(f.observedAt) + (Number(f.props.fatalities) || 0) * 3600_000,
  subtitle: (f) => [str(f.props.date), str(f.props.actor1), Number(f.props.fatalities) ? `${String(f.props.fatalities)} killed` : undefined].filter(Boolean).join(' · '),
  Detail: AcledDetail,
}
