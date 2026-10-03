import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, fetchText, osintFeature } from './util.ts'

type Geo = { date: string; type: string; coordinates: number[] | number[][] | number[][][]; magnitudeValue?: number; magnitudeUnit?: string }
type Ev = { id: string; title: string; link: string; categories: { id: string; title: string }[]; sources?: { id: string; url: string }[]; geometry: Geo[] }

// Volcanoes (ash-closed airspace), storms and floods. Wildfires are left out: ~100 low-severity
// pins drown the security picture (GDACS still reports the Orange/Red ones).
const KEEP = new Set(['volcanoes', 'severeStorms', 'floods'])

function firstPoint(g: Geo): [number, number] | null {
  const c = g.coordinates as unknown
  if (g.type === 'Point' && Array.isArray(c)) return [c[0] as number, c[1] as number]
  let cur: unknown = c
  while (Array.isArray(cur) && Array.isArray(cur[0])) cur = cur[0]
  return Array.isArray(cur) && typeof cur[0] === 'number' ? [cur[0], cur[1] as number] : null
}

/** NASA EONET: curated open natural events with the latest known position. */
export const eonetProvider: Provider = {
  id: 'eonet',
  layerId: LAYER_ID,
  ttlMs: 15 * 60_000,
  async fetch() {
    const d = JSON.parse(await fetchText('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=120')) as { events: Ev[] }
    const out = []
    for (const e of d.events) {
      const cat = e.categories[0]
      if (!cat || !KEEP.has(cat.id) || !e.geometry.length) continue
      const g = e.geometry[e.geometry.length - 1]
      if (Date.now() - Date.parse(g.date) > 3 * 86_400_000) continue // EONET leaves stale events "open"
      const pt = firstPoint(g)
      if (!pt) continue
      out.push(
        osintFeature({
          provider: 'eonet',
          feed: 'NASA EONET',
          externalId: e.id,
          title: e.title,
          category: cat.title.toLowerCase(),
          severity: cat.id === 'volcanoes' ? 'medium' : 'low',
          magnitude: g.magnitudeValue ? `${g.magnitudeValue} ${g.magnitudeUnit ?? ''}`.trim() : undefined,
          summary: `Source: ${e.sources?.map((s) => s.id).join(', ') ?? 'n/a'}`,
          lat: pt[1],
          lon: pt[0],
          precision: 'exact',
          basis: 'latest reported position',
          url: e.sources?.[0]?.url ?? e.link,
          at: g.date,
        }),
      )
    }
    return out
  },
}
