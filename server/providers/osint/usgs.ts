import type { Provider } from '../../core/provider.ts'
import { fetchText, osintFeature } from './util.ts'

type Quake = { id: string; properties: { mag: number; place: string; time: number; url: string; alert?: string; tsunami?: number; sig?: number }; geometry: { coordinates: [number, number, number] } }

/** USGS earthquakes M4.5+, last 24 h. Seismometer-derived epicentres => exact. */
export const usgsProvider: Provider = {
  id: 'usgs',
  layerId: 'hazards',
  ttlMs: 5 * 60_000,
  async fetch() {
    const d = JSON.parse(await fetchText('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson')) as { features: Quake[] }
    return d.features.map((q) => {
      const [lon, lat, depth] = q.geometry.coordinates
      const m = q.properties.mag
      return osintFeature({
        provider: 'usgs',
        feed: 'USGS',
        externalId: q.id,
        title: `M${m.toFixed(1)} earthquake: ${q.properties.place}`,
        category: 'earthquake',
        severity: m >= 6.5 || q.properties.alert === 'red' ? 'high' : m >= 5.5 || q.properties.alert === 'orange' ? 'medium' : 'low',
        magnitude: `M${m.toFixed(1)}`,
        summary: `Depth ${depth.toFixed(0)} km${q.properties.tsunami ? ' · tsunami flag set' : ''}${q.properties.alert ? ` · PAGER ${q.properties.alert}` : ''}. Seismic events can also be nuclear tests: check depth and signature.`,
        lat,
        lon,
        precision: 'exact',
        basis: 'USGS epicentre',
        url: q.properties.url,
        at: new Date(q.properties.time).toISOString(),
      })
    })
  },
}
