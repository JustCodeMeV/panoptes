import type { Feature, LayerResponse, ProviderStatus } from '../../shared/feature.ts'
import { TtlCache } from './cache.ts'
import type { Provider } from './provider.ts'

const cache = new TtlCache<LayerResponse>(15_000)

/**
 * Runs every enabled provider of a layer in parallel. One provider failing
 * never takes the layer down; failures are reported in `providers[]`.
 * Features are deduped by id (earlier providers win).
 */
export function loadLayer(layerId: string, providers: Provider[]): Promise<LayerResponse> {
  return cache.get(layerId, async () => {
    const active = providers.filter((p) => p.enabled?.() ?? true)
    const statuses: ProviderStatus[] = []

    const results = await Promise.all(
      active.map(async (p) => {
        const t0 = Date.now()
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 25_000)
        try {
          const features = await p.fetch({ signal: ac.signal })
          statuses.push({ id: p.id, ok: true, count: features.length, ms: Date.now() - t0 })
          return features
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          console.warn(`[provider:${p.id}] failed: ${error}`)
          statuses.push({ id: p.id, ok: false, count: 0, error, ms: Date.now() - t0 })
          return [] as Feature[]
        } finally {
          clearTimeout(timer)
        }
      }),
    )

    const byId = new Map<string, Feature>()
    for (const list of results) for (const f of list) if (!byId.has(f.id)) byId.set(f.id, f)

    return {
      layerId,
      generatedAt: new Date().toISOString(),
      features: [...byId.values()],
      providers: statuses,
    }
  })
}
