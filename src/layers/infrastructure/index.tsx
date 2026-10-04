import type { LayerDef } from '../../core/types'
import { CableDetail } from './Detail'
import { CABLE_GREY } from './props'

/** Critical infrastructure context: submarine cable routes (TeleGeography). */
export const infrastructure: LayerDef = {
  id: 'infrastructure',
  group: 'Space & infrastructure',
  label: 'Deep Sea Cables',
  description: 'Undersea internet cable routes (TeleGeography): context for outages and sabotage claims.',
  color: CABLE_GREY,
  refreshMs: 24 * 3600_000,
  defaultEnabled: false,
  pin: () => ({ size: 0 }),
  shape: () => ({ color: CABLE_GREY, alpha: 0.95, width: 1.4 }),
  subtitle: () => 'submarine cable',
  Detail: CableDetail,
}
