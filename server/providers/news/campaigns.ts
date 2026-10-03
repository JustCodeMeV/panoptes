import type { Provider } from '../../core/provider.ts'
import type { Assessment } from '../../../shared/truth.ts'
import { isFlagged } from '../../../shared/network.ts'
import { snapshot } from '../../news/engine.ts'

/**
 * "Campaign watch": the subset of live stories whose spread pattern raises flags
 * (state-first, aligned state media, social surge, contradicted...). Derived from
 * the news engine, so it is always as fresh as the wire.
 */
export const campaignsProvider: Provider = {
  id: 'campaign-detector',
  layerId: 'campaigns',
  ttlMs: 15_000,
  async fetch() {
    return snapshot()
      .features.filter((f) => isFlagged(f.props.assessment as Assessment))
      .map((f) => ({ ...f, id: f.id.replace(/^news:/, 'campaigns:'), layerId: 'campaigns', tags: [...f.tags, 'campaign'] }))
  },
}
