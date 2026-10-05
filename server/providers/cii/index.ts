import type { Provider } from '../../core/provider.ts'
import { LAYER_ID } from '../../cii/engine.ts'
import { heatmapFeatures } from '../../cii/heatmap.ts'

/**
 * Instability on the map: a heatmap of where it is unstable (server/cii/heatmap.ts), not whole
 * countries. The per-country index (server/cii/engine.ts) still feeds the Brief and the atlas.
 */
export const ciiProvider: Provider = {
  id: 'instability-heatmap',
  layerId: LAYER_ID,
  ttlMs: 60_000,
  async fetch() {
    return heatmapFeatures()
  },
}
