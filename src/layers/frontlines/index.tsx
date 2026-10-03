import type { LayerDef } from '../../core/types'
import { FrontDetail } from './Detail'
import { occupied } from './props'

/** Russo-Ukrainian front: occupied and contested areas (DeepState, daily). */
export const frontlines: LayerDef = {
  id: 'frontlines',
  label: 'Frontline (Ukraine)',
  description: 'Occupied and contested territory in Ukraine, from the DeepState map (updated daily).',
  color: '#dc2626',
  refreshMs: 60 * 60_000,
  defaultEnabled: false,
  pin: () => ({ size: 0 }),
  shape: (f) => (occupied(f) ? { color: '#dc2626', alpha: 0.28, width: 1.5 } : { color: '#a8a29e', alpha: 0.35 }),
  rank: (f) => (occupied(f) ? 1 : 0),
  subtitle: (f) => (occupied(f) ? 'occupied' : 'contested / unknown status'),
  Detail: FrontDetail,
}
