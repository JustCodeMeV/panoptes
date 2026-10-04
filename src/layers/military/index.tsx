import type { LayerDef } from '../../core/types'
import { AircraftDetail } from './Detail'
import { str } from './props'

/** Military aircraft broadcasting ADS-B right now (adsb.lol, unfiltered community network). */
export const militaryAir: LayerDef = {
  id: 'military-air',
  label: 'Military Aircraft',
  description: 'Military aircraft broadcasting ADS-B right now: tankers, ISR, transports (adsb.lol). Many fly dark.',
  color: '#a3e635',
  refreshMs: 60_000,
  defaultEnabled: false,
  pin: (f) => ({ size: f.props.squawk ? 24 : 16, color: f.props.squawk ? '#ef4444' : undefined, glyph: 'pulse' }),
  rank: (f) => (f.props.squawk ? 1e6 : 0) + (Number(String(f.props.altitude ?? '').replace(/\D/g, '')) || 0),
  subtitle: (f) => [str(f.props.type), str(f.props.altitude), str(f.props.operator)].filter(Boolean).join(' · '),
  Detail: AircraftDetail,
}
