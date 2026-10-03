import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, snapshot } from '../../telegram/engine.ts'

/** Request/response view of the Telegram scouts (initial load + non-streaming fallback). */
export const telegramProvider: Provider = {
  id: 'telegram-scouts',
  layerId: LAYER_ID,
  ttlMs: 15_000,
  async fetch() {
    return snapshot().features
  },
}
