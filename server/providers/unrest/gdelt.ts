import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, health, hotspots } from '../../unrest/engine.ts'

export const gdeltEventsProvider: Provider = {
  id: 'gdelt-events',
  layerId: LAYER_ID,
  ttlMs: 30_000,
  async fetch() {
    const h = health()
    if (!h.ok && h.events === 0) throw new Error(h.error ?? 'warming up')
    return hotspots()
  },
}
