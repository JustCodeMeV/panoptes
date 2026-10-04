import type { LayerDef } from '../../core/types'
import { COLOR } from './colors'
import { WarningDetail } from './Detail'

/** Airspace closures, live-fire and navigational notices, maritime security incidents, launches, space weather. */
export const warnings: LayerDef = {
  id: 'warnings',
  label: 'Maritime & Air Warnings',
  group: 'War & security',
  description:
    'Airspace closures and NOTAMs, live-fire drills and naval exercises, maritime security incidents (UKMTO, JMIC), missile and rocket launch notices, GNSS interference, and space weather (NOAA) that degrades GPS and radio worldwide.',
  color: '#f97316',
  refreshMs: 300_000,
  pin: (f) => ({ size: f.props.military ? 24 : 20, color: COLOR[String(f.props.category)], glyph: 'alert' }),
  shape: (f) => ({ color: COLOR[String(f.props.category)], alpha: 0.18, width: 2 }),
  rank: (f) => (f.props.military ? 1e13 : 0) + Date.parse(f.observedAt),
  legend: Object.entries(COLOR),
  subtitle: (f) => `${String(f.props.category)} · ${f.source.platform}`,
  Detail: WarningDetail,
}
