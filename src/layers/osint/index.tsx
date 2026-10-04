import type { LayerDef } from '../../core/types'
import { OsintDetail } from './Detail'

import { SEVERITY, type Severity as Sev } from './severity'
const sev = (f: { props: Record<string, unknown> }) => (f.props.severity as Sev) ?? 'low'

/** Internet blackouts and censorship: often the first sign of unrest or a crackdown. */
export const osint: LayerDef = {
  id: 'osint',
  label: 'Internet Outages & Censorship',
  group: 'Jamming, outages & cyber',
  description: 'Internet blackouts (IODA, Cloudflare Radar) and measured censorship (OONI): often the first sign of unrest or a crackdown.',
  color: '#eab308',
  refreshMs: 120_000,
  defaultEnabled: true,
  pin: (f) => ({ size: sev(f) === 'high' ? 30 : sev(f) === 'medium' ? 26 : 22, color: SEVERITY[sev(f)], glyph: 'pulse' }),
  rank: (f) => ({ high: 3, medium: 2, low: 1 })[sev(f)] * 1e13 + Date.parse(f.observedAt),
  legend: Object.entries(SEVERITY).map(([k, c]) => [`${k} severity`, c]),
  subtitle: (f) => `${f.props.category} · ${f.props.feed}${f.props.magnitude ? ` · ${f.props.magnitude}` : ''}`,
  Detail: OsintDetail,
}
