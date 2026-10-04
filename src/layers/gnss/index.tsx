import type { LayerDef } from '../../core/types'
import { GnssDetail } from './Detail'
import { share, color } from './props'

/** Electronic-warfare footprint: where GPS is being jammed or spoofed (GPSJam, daily). */
export const gnss: LayerDef = {
  id: 'gnss',
  label: 'GPS Jamming',
  description: 'Where aircraft reported degraded GPS yesterday: jamming and spoofing around conflict zones (GPSJam, ADS-B derived, daily).',
  color: '#f97316',
  refreshMs: 30 * 60_000,
  defaultEnabled: false,
  pin: () => ({ size: 0 }),
  shape: (f) => ({ color: color(share(f)), alpha: 0.3 + share(f) * 0.45 }),
  rank: (f) => share(f),
  subtitle: (f) => `${Math.round(share(f) * 100)}% affected · ${String(f.props.bad)} aircraft`,
  Detail: GnssDetail,
}
