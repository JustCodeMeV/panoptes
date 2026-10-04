import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, snapshot } from '../../x/engine.ts'
import { grokEnabled } from '../../x/grok.ts'

/** Request/response view of the Twitter/X layer: Grok's latest checks of trending, unsettled stories. */
export const grokProvider: Provider = {
  id: 'grok-x-search',
  layerId: LAYER_ID,
  ttlMs: 15_000,
  enabled: grokEnabled,
  async fetch() {
    if (!grokEnabled()) throw new Error('no XAI_API_KEY')
    return snapshot().features
  },
}
