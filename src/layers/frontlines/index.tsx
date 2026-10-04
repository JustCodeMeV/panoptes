import type { LayerDef } from '../../core/types'
import { isZone, occupied, ZONE_COLOR } from './props'
import { FrontlinesDetail } from './ZoneDetail'

/** Front lines and territorial control. Today: the Russo-Ukrainian front (DeepState, daily); more theatres slot in as providers. */
export const frontlines: LayerDef = {
  id: 'frontlines',
  group: 'War & security',
  label: 'Frontlines & Conflict Zones',
  description: 'Every active war: Ukraine’s front line (DeepState, daily), and for Sudan, Gaza, Lebanon, Syria, Yemen, Myanmar, eastern DR Congo, the Sahel, Lake Chad, Somalia, Ethiopia, Haiti, Colombia, Mexico, Kashmir and more, the regions where fighting happens, shaded by live activity in the last 3 days.',
  color: '#dc2626',
  refreshMs: 60 * 60_000,
  defaultEnabled: false,
  pin: () => ({ size: 0 }),
  shape: (f) => (isZone(f) ? { color: ZONE_COLOR[String(f.props.intensity)], alpha: 0.16, width: 1.5 } : occupied(f) ? { color: '#dc2626', alpha: 0.28, width: 1.5 } : { color: '#a8a29e', alpha: 0.35 }),
  rank: (f) => (isZone(f) ? 2 + Number(f.props.reports) : occupied(f) ? 1 : 0),
  subtitle: (f) => (isZone(f) ? `${String(f.props.intensity)} activity · ${String(f.props.reports)} live reports` : occupied(f) ? 'occupied' : 'contested / unknown status'),
  Detail: FrontlinesDetail,
}
