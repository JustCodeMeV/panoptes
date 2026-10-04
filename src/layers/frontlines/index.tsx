import type { LayerDef } from '../../core/types'
import { FrontDetail } from './Detail'
import { occupied } from './props'

/** Front lines and territorial control. Today: the Russo-Ukrainian front (DeepState, daily); more theatres slot in as providers. */
export const frontlines: LayerDef = {
  id: 'frontlines',
  label: 'Frontlines',
  description: 'Front lines and territorial control. Currently Ukraine: occupied and contested territory from the DeepState map, updated daily.',
  color: '#dc2626',
  refreshMs: 60 * 60_000,
  defaultEnabled: false,
  pin: () => ({ size: 0 }),
  shape: (f) => (occupied(f) ? { color: '#dc2626', alpha: 0.28, width: 1.5 } : { color: '#a8a29e', alpha: 0.35 }),
  rank: (f) => (occupied(f) ? 1 : 0),
  subtitle: (f) => (occupied(f) ? 'occupied' : 'contested / unknown status'),
  Detail: FrontDetail,
}
