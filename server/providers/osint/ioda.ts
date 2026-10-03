import type { Provider } from '../../core/provider.ts'
import { geolocate } from '../../geo/gazetteer.ts'
import { LAYER_ID, fetchText, osintFeature } from './util.ts'

type Alert = { datasource: string; entity: { code: string; name: string }; time: number; level: string; condition?: string; value?: number; historyValue?: number }

/**
 * Georgia Tech IODA: internet-outage detection (BGP routes, active probing,
 * darknet traffic). National blackouts routinely accompany crackdowns, coups
 * and strikes on infrastructure. Country-level only => position is the country
 * centroid, labelled inferred.
 */
export const iodaProvider: Provider = {
  id: 'ioda',
  layerId: LAYER_ID,
  ttlMs: 5 * 60_000,
  async fetch() {
    const now = Math.floor(Date.now() / 1000)
    const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts?from=${now - 6 * 3600}&until=${now}&entityType=country&limit=1000`
    const d = JSON.parse(await fetchText(url, 30_000)) as { data: Alert[] | null; error?: string | null }
    if (d.error) throw new Error(`IODA: ${d.error}`)
    const byCountry = new Map<string, { name: string; code: string; sources: Set<string>; level: string; latest: number; drop: number }>()
    for (const a of d.data ?? []) {
      if (a.level !== 'critical' && a.level !== 'warning') continue
      const cur = byCountry.get(a.entity.code) ?? { name: a.entity.name, code: a.entity.code, sources: new Set(), level: 'warning', latest: 0, drop: 0 }
      cur.sources.add(a.datasource)
      if (a.level === 'critical') cur.level = 'critical'
      cur.latest = Math.max(cur.latest, a.time)
      if (a.value !== undefined && a.historyValue) cur.drop = Math.max(cur.drop, 1 - a.value / a.historyValue)
      byCountry.set(a.entity.code, cur)
    }
    const out = []
    for (const c of byCountry.values()) {
      // Plain warnings from one source are common noise; a critical alert or two independent sources is not.
      if (c.level !== 'critical' && c.sources.size < 2) continue
      const hit = geolocate(c.name)
      if (!hit) continue // tiny territories we cannot place: not useful on the map
      out.push(
        osintFeature({
          provider: 'ioda',
          feed: 'IODA',
          externalId: c.code,
          title: `Internet disruption: ${c.name}`,
          category: 'internet outage',
          severity: c.level === 'critical' && c.sources.size >= 2 ? 'high' : 'medium',
          magnitude: c.drop > 0 ? `${Math.round(c.drop * 100)}% below baseline` : undefined,
          summary: `Detected by ${[...c.sources].join(' + ')} in the last 6 h. Blackouts often accompany unrest, crackdowns or damaged infrastructure; also caused by cable cuts and power failure.`,
          lat: hit.lat,
          lon: hit.lon,
          precision: 'inferred',
          basis: `country-level signal, shown at ${hit.name} (${hit.kind})`,
          url: `https://ioda.inetintel.cc.gatech.edu/country/${c.code}`,
          at: new Date(c.latest * 1000).toISOString(),
        }),
      )
    }
    return out
  },
}
