import type { LayerDef } from '../../core/types'
import { ShipDetail } from './Detail'
import { SHIP_COLOR } from './props'

/** Ships at strategic chokepoints from live AIS (AISStream; needs a free key). */
export const ships: LayerDef = {
  id: 'ships',
  group: 'War & security',
  label: 'Maritime Chokepoints',
  description: 'Live AIS around Hormuz, Bab el-Mandeb, Suez, the Bosporus, Kerch, the Taiwan Strait and the Gulf of Finland. Vessels that stop reporting are flagged as gone dark (AISStream, free key).',
  color: '#38bdf8',
  refreshMs: 20_000,
  defaultEnabled: false,
  pin: (f) => (f.props.dark ? { size: 18, color: '#ef4444', glyph: 'alert' } : { size: 11, color: SHIP_COLOR[String(f.props.shipType)] }),
  rank: (f) => (f.props.dark ? 1e13 : 0) + (f.props.shipType === 'military' ? 1e12 : f.props.shipType === 'tanker' ? 1e11 : 0) + Date.parse(f.observedAt),
  subtitle: (f) => [String(f.props.shipType ?? 'vessel'), String(f.props.zone), f.props.speedKn !== undefined ? `${String(f.props.speedKn)} kn` : undefined, f.props.dark ? 'went dark' : undefined].filter(Boolean).join(' · '),
  Detail: ShipDetail,
}
