import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { TtlCache } from '../../core/cache.ts'
import { fetchText } from '../osint/util.ts'

export const LAYER_ID = 'frontlines'
const cache = new TtlCache<Feature[]>(3 * 3600_000)

type GJ = { type: string; properties: { name: string }; geometry: { type: string; coordinates: number[][][] } }

/** Which DeepState areas we draw. Their map also carries editorial "occupied" claims (Karelia, Kurils...) we skip. */
export function classify(name: string): { status: 'occupied' | 'contested'; label: string } | null {
  const en = (name.split('///')[1] ?? name).trim()
  if (/^Unknown status/i.test(en)) return { status: 'contested', label: 'Contested / unknown status' }
  if (/^Occupied$/i.test(en)) return { status: 'occupied', label: 'Occupied by Russia' }
  if (/Occupied Crimea|CADR and CALR|Tuzla/i.test(en)) return { status: 'occupied', label: `Occupied since 2014: ${en.replace(/^Occupied /, '')}` }
  return null
}

/**
 * DeepState (Ukrainian OSINT group): daily-updated map of the Russo-Ukrainian
 * front. Polygons of occupied and contested territory. A partisan source with
 * a strong track record; shown with that caveat.
 */
export const deepstateProvider: Provider = {
  id: 'deepstate',
  layerId: LAYER_ID,
  ttlMs: 3 * 3600_000,
  fetch() {
    return cache.get('map', async () => {
      const d = JSON.parse(await fetchText('https://deepstatemap.live/api/history/last', 40_000)) as { id: number; datetime?: string; map: { features: GJ[] } }
      const now = new Date().toISOString()
      const at = new Date(d.id * 1000).toISOString()
      const out: Feature[] = []
      d.map.features.forEach((f, i) => {
        if (f.geometry.type !== 'Polygon') return
        const c = classify(f.properties.name)
        if (!c) return
        const rings = f.geometry.coordinates.map((r) => r.map(([lon, lat]) => [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]))
        const [lon, lat] = centroid(rings[0])
        out.push({
          id: `${LAYER_ID}:deepstate:${i}`,
          layerId: LAYER_ID,
          title: c.label,
          position: { lat, lon },
          geometry: { type: 'Polygon', coordinates: rings },
          geoPrecision: 'approximate',
          geoBasis: 'area drawn by DeepState analysts from geolocated footage and reports',
          observedAt: at,
          source: { provider: 'deepstate', platform: 'deepstatemap.live', url: 'https://deepstatemap.live/en', retrievedAt: now },
          tags: ['frontline', c.status],
          props: { kind: 'frontline', status: c.status, mapId: d.id },
        })
      })
      return out
    })
  },
}

function centroid(ring: number[][]): [number, number] {
  let x = 0
  let y = 0
  for (const [lon, lat] of ring) {
    x += lon
    y += lat
  }
  return [x / ring.length, y / ring.length]
}
