import { unzipSync, strFromU8 } from 'fflate'

/**
 * GDELT 2.0 event export: a new tab-separated file every 15 minutes, no key.
 * Columns used (0-based): 26 EventCode, 28 EventRootCode, 30 Goldstein,
 * 31 NumMentions, 32 NumSources, 34 AvgTone, 51 ActionGeo_Type, 52 name,
 * 53 country, 56/57 lat/lon, 59 DATEADDED, 60 SOURCEURL.
 */
export type GdeltEvent = {
  id: string
  at: number
  root: string
  code: string
  mentions: number
  sources: number
  tone: number
  goldstein: number
  geoType: number
  place: string
  country: string
  lat: number
  lon: number
  url: string
}

/** CAMEO root codes we treat as unrest/violence. */
export const ROOT_LABEL: Record<string, string> = {
  '14': 'protest',
  '15': 'show of force',
  '17': 'coercion',
  '18': 'assault',
  '19': 'armed clash',
  '20': 'mass violence',
}

const UA = { 'user-agent': 'Mozilla/5.0 panoptes-research/0.1' }
const BASE = 'http://data.gdeltproject.org/gdeltv2/'

const pad = (n: number) => String(n).padStart(2, '0')
export const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`

export function parseStamp(s: string): number {
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12))
}

export function parseExport(tsv: string): GdeltEvent[] {
  const out: GdeltEvent[] = []
  for (const line of tsv.split('\n')) {
    const c = line.split('\t')
    if (c.length < 61) continue
    const root = c[28]
    if (!ROOT_LABEL[root]) continue
    const lat = parseFloat(c[56])
    const lon = parseFloat(c[57])
    const geoType = parseInt(c[51], 10)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    // City-level only (3 = US city, 4 = world city). Country/state centroids are not event locations.
    if ((geoType !== 3 && geoType !== 4) || !c[60]) continue
    out.push({
      id: c[0],
      at: c[59] ? parseStamp(c[59]) : Date.now(),
      root,
      code: c[26],
      mentions: parseInt(c[31], 10) || 1,
      sources: parseInt(c[32], 10) || 1,
      tone: parseFloat(c[34]) || 0,
      goldstein: parseFloat(c[30]) || 0,
      geoType,
      place: c[52],
      country: c[53],
      lat,
      lon,
      url: c[60],
    })
  }
  return out
}

/** Try a timestamped file; `null` when it does not exist (404 = not published yet). */
export async function fetchExport(ts: string): Promise<GdeltEvent[] | null> {
  const res = await fetch(`${BASE}${ts}.export.CSV.zip`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GDELT export ${ts} HTTP ${res.status}`)
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
  const name = Object.keys(files)[0]
  return name ? parseExport(strFromU8(files[name])) : []
}

export async function latestStamp(): Promise<string> {
  const res = await fetch(`${BASE}lastupdate.txt`, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`GDELT lastupdate HTTP ${res.status}`)
  const m = (await res.text()).match(/(\d{14})\.export/)
  if (!m) throw new Error('GDELT lastupdate: no export file')
  return m[1]
}
