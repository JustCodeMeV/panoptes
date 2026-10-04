import type { LayerDef } from '../../core/types'
import { OsintDetail } from '../osint/Detail'
import { SEVERITY, type Severity as Sev } from '../osint/severity'

const sev = (f: { props: Record<string, unknown> }) => (f.props.severity as Sev) ?? 'low'

/** Natural hazards: UN disaster alerts, earthquakes, NASA natural events and fires. */
export const hazards: LayerDef = {
  id: 'hazards',
  label: 'Natural Hazards',
  group: 'Humanitarian & hazards',
  description: 'UN/EC disaster alerts (GDACS orange and red), earthquakes (USGS), NASA natural events (EONET) and active fires (FIRMS).',
  color: '#f59e0b',
  refreshMs: 120_000,
  pin: (f) => ({ size: sev(f) === 'high' ? 30 : sev(f) === 'medium' ? 26 : 22, color: SEVERITY[sev(f)], glyph: 'pulse' }),
  rank: (f) => ({ high: 3, medium: 2, low: 1 })[sev(f)] * 1e13 + Date.parse(f.observedAt),
  subtitle: (f) => `${f.props.category} · ${f.props.feed}${f.props.magnitude ? ` · ${f.props.magnitude}` : ''}`,
  Detail: OsintDetail,
}
