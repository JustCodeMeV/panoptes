import type { Provider } from '../../core/provider.ts'
import { geolocate } from '../../geo/gazetteer.ts'
import { LAYER_ID, fetchText, osintFeature } from './util.ts'

type Row = { probe_cc: string; measurement_count: number; anomaly_count: number; confirmed_count: number }
const names = new Intl.DisplayNames(['en'], { type: 'region' })

/**
 * OONI: volunteer probes test whether websites load. "Confirmed" = a known
 * block page; "anomaly" = interference signature (DNS/TCP/HTTP tampering).
 * Censorship is the information-control half of an influence operation.
 * Country-level => country centroid, inferred.
 */
export const ooniProvider: Provider = {
  id: 'ooni',
  layerId: LAYER_ID,
  async fetch() {
    const day = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10)
    const url = `https://api.ooni.io/api/v1/aggregation?since=${day(1)}&until=${day(-1)}&axis_x=probe_cc&test_name=web_connectivity`
    const d = JSON.parse(await fetchText(url, 40_000)) as { result: Row[] }
    const out = []
    for (const r of d.result ?? []) {
      if (r.measurement_count < 300) continue // too few probes to say anything
      const confirmed = r.confirmed_count / r.measurement_count
      const anomaly = r.anomaly_count / r.measurement_count
      const severity = confirmed >= 0.1 || anomaly >= 0.4 ? 'high' : confirmed >= 0.01 || anomaly >= 0.15 ? 'medium' : null
      if (!severity) continue
      const name = names.of(r.probe_cc) ?? r.probe_cc
      const hit = geolocate(name)
      if (!hit) continue
      out.push(
        osintFeature({
          provider: 'ooni',
          feed: 'OONI',
          externalId: r.probe_cc,
          title: `Web censorship: ${name}`,
          category: 'censorship',
          severity,
          magnitude: `${(confirmed * 100).toFixed(1)}% confirmed blocks · ${(anomaly * 100).toFixed(0)}% anomalous`,
          summary: `${r.measurement_count.toLocaleString()} website tests by OONI volunteers in the last 24 h: ${r.confirmed_count.toLocaleString()} hit a known block page, ${r.anomaly_count.toLocaleString()} showed interference. Blocking independent media is the information-control side of influence campaigns.`,
          lat: hit.lat,
          lon: hit.lon,
          precision: 'inferred',
          basis: `country-level measurements, shown at ${hit.name} (${hit.kind})`,
          url: `https://explorer.ooni.org/country/${r.probe_cc}`,
        }),
      )
    }
    return out
  },
}
