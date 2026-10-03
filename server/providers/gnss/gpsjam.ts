import { cellToBoundary, cellToLatLng } from 'h3-js'
import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { TtlCache } from '../../core/cache.ts'
import { fetchText } from '../osint/util.ts'

export const LAYER_ID = 'gnss'
const cache = new TtlCache<Feature[]>(6 * 3600_000)

/**
 * GPSJam: aircraft report their navigation accuracy over ADS-B; a hex where
 * many aircraft report degraded accuracy indicates GNSS jamming or spoofing
 * (electronic warfare). Daily H3 (res 4, ~1,800 km²) aggregate of yesterday.
 * Only cells with >10% affected aircraft (GPSJam's "high" band) are kept.
 */
export const gpsjamProvider: Provider = {
  id: 'gpsjam',
  layerId: LAYER_ID,
  fetch() {
    return cache.get('cells', async () => {
      // Today's file appears during the day; fall back to the day before.
      let csv = ''
      let day = ''
      for (const back of [1, 2]) {
        day = new Date(Date.now() - back * 86400_000).toISOString().slice(0, 10)
        try {
          csv = await fetchText(`https://gpsjam.org/data/${day}-h3_4.csv`, 40_000)
          break
        } catch (e) {
          if (back === 2) throw e
        }
      }
      return parseGpsjam(csv, day)
    })
  },
}

const round = (v: number) => Math.round(v * 1000) / 1000

export function parseGpsjam(csv: string, day: string): Feature[] {
  const now = new Date().toISOString()
  const out: Feature[] = []
  for (const line of csv.split('\n').slice(1)) {
    const [hex, g, b] = line.split(',')
    const good = Number(g)
    const bad = Number(b)
    const total = good + bad
    if (!hex || total < 3 || bad / total <= 0.1) continue
    const [lat, lon] = cellToLatLng(hex)
    const ring = cellToBoundary(hex, true).map(([x, y]) => [round(x), round(y)]) // [lon, lat], closed
    const share = bad / total
    out.push({
      id: `${LAYER_ID}:gpsjam:${hex}`,
      layerId: LAYER_ID,
      title: `GNSS interference: ${Math.round(share * 100)}% of aircraft affected`,
      position: { lat, lon },
      geometry: { type: 'Polygon', coordinates: [ring] },
      geoPrecision: 'approximate',
      geoBasis: 'H3 cell (~1,800 km²) where aircraft reported degraded GPS accuracy',
      observedAt: `${day}T12:00:00.000Z`,
      source: { provider: 'gpsjam', platform: 'gpsjam.org', url: `https://gpsjam.org/?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&z=6&date=${day}`, retrievedAt: now },
      tags: ['gnss', 'electronic-warfare'],
      props: { kind: 'gnss', share, bad, good, day, intensity: Math.min(1, share * 2) },
    })
  }
  return out
}
