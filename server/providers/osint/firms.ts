import type { Provider } from '../../core/provider.ts'
import { TtlCache } from '../../core/cache.ts'
import type { Feature } from '../../../shared/feature.ts'
import { LAYER_ID, fetchText, osintFeature } from './util.ts'

/** Conflict areas only: a global fire map is mostly agriculture. west,south,east,north */
const AREAS: { name: string; bbox: string }[] = [
  { name: 'Ukraine / western Russia', bbox: '22,44,41,53' },
  { name: 'Levant', bbox: '34,29,37,34' },
  { name: 'Red Sea / Yemen', bbox: '41,12,46,18' },
  { name: 'Sudan', bbox: '22,10,38,22' },
]
const cache = new TtlCache<Feature[]>(30 * 60_000)

/**
 * NASA FIRMS (VIIRS, ~375 m pixels): thermal anomalies from the last 24 h in
 * conflict areas. Fires at depots, refineries and front positions show up
 * hours before footage does; most hotspots are still ordinary fires.
 * Needs a free FIRMS_MAP_KEY.
 */
export const firmsProvider: Provider = {
  id: 'nasa-firms',
  layerId: LAYER_ID,
  async fetch() {
    const key = process.env.FIRMS_MAP_KEY
    if (!key) throw new Error('no FIRMS_MAP_KEY')
    return cache.get('hot', async () => {
      const out: Feature[] = []
      for (const a of AREAS) {
        const csv = await fetchText(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${a.bbox}/1`, 40_000)
        out.push(...parseFirms(csv, a.name))
      }
      return out
    })
  },
}

/** High-confidence, high-power detections only (FRP >= 10 MW), else the map drowns in crop fires. */
export function parseFirms(csv: string, area: string): Feature[] {
  const [head, ...rows] = csv.trim().split('\n')
  if (!head?.includes('latitude')) throw new Error(`FIRMS: ${head?.slice(0, 80) ?? 'empty response'}`)
  const col = Object.fromEntries(head.split(',').map((h, i) => [h, i]))
  const out: Feature[] = []
  for (const row of rows) {
    const c = row.split(',')
    const frp = Number(c[col.frp])
    const conf = c[col.confidence]
    if (frp < 10 || conf === 'l') continue
    const lat = Number(c[col.latitude])
    const lon = Number(c[col.longitude])
    const t = c[col.acq_time].padStart(4, '0')
    const at = `${c[col.acq_date]}T${t.slice(0, 2)}:${t.slice(2)}:00Z`
    out.push(
      osintFeature({
        provider: 'nasa-firms',
        feed: 'NASA FIRMS',
        externalId: `${lat.toFixed(3)},${lon.toFixed(3)},${at}`,
        title: `Thermal anomaly (${Math.round(frp)} MW) · ${area}`,
        category: 'thermal anomaly',
        severity: frp >= 50 ? 'high' : frp >= 20 ? 'medium' : 'low',
        magnitude: `${Math.round(frp)} MW radiative power`,
        summary: 'Satellite-detected heat source (VIIRS). Strikes on fuel depots and refineries, and fighting, produce these; so do wildfires, flares and field burning. Corroborate before reporting.',
        lat,
        lon,
        precision: 'exact',
        basis: 'satellite pixel centre (~375 m)',
        url: `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lon.toFixed(3)},${lat.toFixed(3)},11z`,
        at,
      }),
    )
  }
  return out
}
