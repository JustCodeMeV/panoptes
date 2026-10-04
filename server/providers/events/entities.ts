import type { Provider } from '../../core/provider.ts'
import { eventFeatures } from '../../entities/engine.ts'

/** Resolved, checked events from the entity graph (server/entities). */
export const eventsProvider: Provider = {
  id: 'entity-engine',
  layerId: 'events',
  ttlMs: 30_000,
  async fetch() {
    return eventFeatures()
  },
}
