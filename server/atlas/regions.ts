import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { geoArea } from 'd3-geo'
import { findCountry } from './countries.ts'

/**
 * REGIONS: first-level subdivisions (states, provinces, oblasts, regions) of any
 * country, from geoBoundaries (open licence, keyless). Their "simplified" files
 * are still several MB for large countries, so each country is thinned once
 * (~2 km tolerance, enough at the zoom a country is viewed), stored gzipped on
 * disk and kept in a small memory cache: the server's memory is tight.
 */

type Meta = { boundaryISO: string; boundaryName: string; simplifiedGeometryGeoJSON: string }
type Ring = [number, number][]
type Geom = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] }
export type Region = { name: string; code?: string; geometry: Geom }
export type RegionSet = { country: string; iso3: string; regions: Region[]; source: string }

const DIR = join(process.cwd(), 'data', 'regions')
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '')
// Names that differ between the map / Factbook and geoBoundaries
const ISO_BY_NAME: Record<string, string> = {
  unitedstates: 'USA', unitedstatesofamerica: 'USA', russia: 'RUS', iran: 'IRN', southkorea: 'KOR', northkorea: 'PRK', syria: 'SYR', venezuela: 'VEN',
  bolivia: 'BOL', tanzania: 'TZA', vietnam: 'VNM', laos: 'LAO', moldova: 'MDA', congo: 'COD', drcongo: 'COD', democraticrepublicofthecongo: 'COD', demrepcongo: 'COD',
  republicofthecongo: 'COG', ivorycoast: 'CIV', cotedivoire: 'CIV', burma: 'MMR', myanmar: 'MMR', czechia: 'CZE', turkey: 'TUR', turkiye: 'TUR', taiwan: 'TWN',
  palestine: 'PSE', westbank: 'PSE', kosovo: 'XKX', unitedkingdom: 'GBR', uk: 'GBR', brunei: 'BRN', eswatini: 'SWZ', macedonia: 'MKD', northmacedonia: 'MKD',
  capeverde: 'CPV', cabo: 'CPV', thegambia: 'GMB', gambia: 'GMB', thebahamas: 'BHS', bahamas: 'BHS', micronesia: 'FSM', southsudan: 'SSD', ssudan: 'SSD',
  centralafricanrep: 'CAF', centralafricanrepublic: 'CAF', dominicanrep: 'DOM', bosniaandherz: 'BIH', bosniaandherzegovina: 'BIH', eqguinea: 'GNQ', wsahara: 'ESH',
}

let metaList: Meta[] | null = null
async function metas(): Promise<Meta[]> {
  if (metaList) return metaList
  const r = await fetch('https://www.geoboundaries.org/api/current/gbOpen/ALL/ADM1/', { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} geoboundaries.org`)
  metaList = ((await r.json()) as Meta[]).map((m) => ({ boundaryISO: m.boundaryISO, boundaryName: m.boundaryName, simplifiedGeometryGeoJSON: m.simplifiedGeometryGeoJSON }))
  return metaList
}

async function metaFor(name: string): Promise<Meta | undefined> {
  const list = await metas()
  const candidates = [name, findCountry(name)?.name ?? '', findCountry(name)?.longName ?? ''].filter(Boolean).map(norm)
  for (const n of candidates) {
    const iso = ISO_BY_NAME[n]
    const m = list.find((x) => (iso && x.boundaryISO === iso) || norm(x.boundaryName) === n)
    if (m) return m
  }
  return undefined
}

/** Keeps a point only when it is at least `tol` degrees from the last kept one; drops rings that collapse. */
function thin(ring: Ring, tol: number): Ring | null {
  const out: Ring = []
  for (const [x, y] of ring) {
    const last = out[out.length - 1]
    if (!last || Math.abs(x - last[0]) + Math.abs(y - last[1]) >= tol) out.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])
  }
  if (out.length < 4) return null
  out.push(out[0])
  return out
}
function thinGeom(g: Geom, tol: number): Geom | null {
  if (g.type === 'Polygon') {
    const rings = g.coordinates.map((r) => thin(r, tol)).filter((r): r is Ring => !!r)
    return rings.length ? { type: 'Polygon', coordinates: rings } : null
  }
  const polys = g.coordinates.map((p) => p.map((r) => thin(r, tol)).filter((r): r is Ring => !!r)).filter((p) => p.length)
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null
}

/**
 * d3-geo reads polygons on the sphere: a ring wound the "wrong" way encloses the rest of the planet,
 * which would put every point on Earth inside the region. Rewind any polygon larger than a hemisphere.
 */
function rewind(g: Geom): Geom {
  const fix = (poly: Ring[]) => (geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map((r) => [...r].reverse()) : poly)
  return g.type === 'Polygon' ? { type: 'Polygon', coordinates: fix(g.coordinates) } : { type: 'MultiPolygon', coordinates: g.coordinates.map(fix) }
}

const mem = new Map<string, { set: RegionSet; gz: Buffer; etag: string }>()
const inflight = new Map<string, Promise<{ set: RegionSet; gz: Buffer; etag: string } | null>>()

/** The country's regions, gzipped JSON ready to send (null when geoBoundaries has none). */
export function regionsFor(name: string): Promise<{ set: RegionSet; gz: Buffer; etag: string } | null> {
  const key = norm(name)
  const hit = mem.get(key)
  if (hit) return Promise.resolve(hit)
  const running = inflight.get(key)
  if (running) return running
  const job = (async () => {
    const m = await metaFor(name)
    if (!m) return null
    const file = join(DIR, `${m.boundaryISO}.json`)
    let set: RegionSet
    if (existsSync(file)) set = JSON.parse(readFileSync(file, 'utf8')) as RegionSet
    else {
      const r = await fetch(m.simplifiedGeometryGeoJSON, { signal: AbortSignal.timeout(60_000), redirect: 'follow' })
      if (!r.ok) throw new Error(`HTTP ${r.status} geoBoundaries ${m.boundaryISO}`)
      const fc = (await r.json()) as { features: { properties: { shapeName?: string; shapeISO?: string }; geometry: Geom }[] }
      const tol = fc.features.length > 60 ? 0.04 : 0.02
      const regions = fc.features
        .map((f): { name: string; code?: string; geometry: Geom | null } => ({ name: String(f.properties.shapeName ?? '?'), code: f.properties.shapeISO || undefined, geometry: thinGeom(f.geometry, tol) }))
        .filter((x): x is Region => !!x.geometry)
      set = { country: name, iso3: m.boundaryISO, regions, source: 'geoBoundaries (gbOpen ADM1)' }
      mkdirSync(DIR, { recursive: true })
      writeFileSync(file, JSON.stringify(set))
    }
    set = { ...set, regions: set.regions.map((r) => ({ ...r, geometry: rewind(r.geometry) })) }
    const json = JSON.stringify(set)
    const v = { set, gz: gzipSync(json), etag: `W/"regions-${m.boundaryISO}-${json.length}"` }
    mem.set(key, v)
    // At most 8 countries in memory; the rest are re-read from disk when asked for again
    if (mem.size > 8) mem.delete(mem.keys().next().value!)
    return v
  })().finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

/** Downloads the likely countries in the background, one at a time, so the first click on them is instant. */
export function prewarmRegions(names: string[]) {
  let i = 0
  const next = () => {
    if (i >= names.length) return
    void regionsFor(names[i++])
      .catch(() => null)
      .finally(() => setTimeout(next, 5_000))
  }
  setTimeout(next, 120_000)
}
