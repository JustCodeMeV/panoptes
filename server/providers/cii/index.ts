import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, ciiFeatures } from '../../cii/engine.ts'

/** Country Instability Index (computed in-process from the other layers). */
export const ciiProvider: Provider = {
  id: 'cii',
  layerId: LAYER_ID,
  ttlMs: 60_000,
  async fetch() {
    return ciiFeatures()
  },
}
