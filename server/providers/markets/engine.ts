import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, snapshot } from '../../markets/engine.ts'

/** Request/response view of the live market engine (non-streaming fallback). */
export const marketsProvider: Provider = {
  id: 'markets-engine',
  layerId: LAYER_ID,
  ttlMs: 15_000,
  async fetch() {
    return snapshot().features
  },
}
