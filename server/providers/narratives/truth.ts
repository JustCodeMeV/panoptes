import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, getNarratives } from '../../truth/engine.ts'

/** Truth sensor: trend narratives + recent debunks, cross-referenced by the engine. */
export const truthProvider: Provider = {
  id: 'truth-engine',
  layerId: LAYER_ID,
  async fetch() {
    return (await getNarratives()).features
  },
}
