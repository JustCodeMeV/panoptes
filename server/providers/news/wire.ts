import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, snapshot } from '../../news/engine.ts'

/** Request/response view of the live wire (initial load + non-streaming fallback). */
export const newsProvider: Provider = {
  id: 'news-wire',
  layerId: LAYER_ID,
  async fetch() {
    return snapshot().features
  },
}
