import type { LayerDef } from '../../core/types'
import { SatelliteDetail } from './Detail'
import { GROUP_COLOR } from './props'

/** Satellites overhead now (military, radar, Earth observation, GNSS, stations), propagated from CelesTrak elements. */
export const satellites: LayerDef = {
  id: 'satellites',
  label: 'Low Orbit Satellites',
  description: 'About 400 satellites in real time: military and reconnaissance, Earth observation, navigation and crewed stations (CelesTrak elements, SGP4).',
  color: '#e2e8f0',
  refreshMs: 20_000,
  defaultEnabled: false,
  pin: (f) => ({ size: f.props.group === 'Military' || f.props.group === 'Crewed stations' ? 14 : 10, color: GROUP_COLOR[String(f.props.group)] }),
  rank: (f) => (f.props.group === 'Military' ? 3 : f.props.group === 'Crewed stations' ? 2 : f.props.group === 'Earth observation' ? 1 : 0),
  subtitle: (f) => `${String(f.props.group)} · ${String(f.props.altitudeKm)} km · ${String(f.props.orbit)}`,
  Detail: SatelliteDetail,
}
