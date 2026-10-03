import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { TtlCache } from '../../core/cache.ts'
import { fetchText } from '../osint/util.ts'

export const LAYER_ID = 'infrastructure'
const cache = new TtlCache<Feature[]>(24 * 3600_000)
const r = (v: number) => Math.round(v * 1000) / 1000

type GJ = { properties: { id: string; name: string; color?: string; coordinates?: [number, number] }; geometry: { type: string; coordinates: number[][][] } }

/**
 * TeleGeography submarine cable map: the routes that carry ~99% of
 * intercontinental traffic. Context for outages (cable cuts) and sabotage
 * claims in the Baltic, Red Sea and Taiwan Strait.
 */
export const cablesProvider: Provider = {
  id: 'submarine-cables',
  layerId: LAYER_ID,
  ttlMs: 24 * 3600_000,
  fetch() {
    return cache.get('cables', async () => {
      const d = JSON.parse(await fetchText('https://www.submarinecablemap.com/api/v3/cable/cable-geo.json', 40_000)) as { features: GJ[] }
      const now = new Date().toISOString()
      return d.features
        .filter((f) => f.geometry.type === 'MultiLineString')
        .map((f): Feature => {
          const lines = f.geometry.coordinates.map((l) => l.map(([lon, lat]) => [r(lon), r(lat)]))
          const [lon, lat] = f.properties.coordinates ?? (lines[0][Math.floor(lines[0].length / 2)] as [number, number])
          return {
            id: `${LAYER_ID}:cable:${f.properties.id}`,
            layerId: LAYER_ID,
            title: f.properties.name,
            position: { lat, lon },
            geometry: { type: 'MultiLineString', coordinates: lines },
            geoPrecision: 'approximate',
            geoBasis: 'published cable route (schematic; actual seabed path differs)',
            observedAt: now,
            source: { provider: 'submarine-cables', platform: 'submarinecablemap.com', url: `https://www.submarinecablemap.com/submarine-cable/${f.properties.id}`, retrievedAt: now },
            tags: ['infrastructure', 'cable'],
            props: { kind: 'cable', color: f.properties.color },
          }
        })
    })
  },
}
