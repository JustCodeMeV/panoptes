import type { LayerDef } from '../../core/types'
import { CableDetail } from './Detail'

/** Critical infrastructure context: submarine cable routes (TeleGeography). */
export const infrastructure: LayerDef = {
  id: 'infrastructure',
  label: 'Submarine cables',
  description: 'Undersea internet cable routes (TeleGeography): context for outages and sabotage claims.',
  color: '#38bdf8',
  refreshMs: 24 * 3600_000,
  defaultEnabled: false,
  pin: () => ({ size: 0 }),
  shape: () => ({ color: '#38bdf8', alpha: 0.55, width: 1.2 }),
  subtitle: () => 'submarine cable',
  Detail: CableDetail,
}
