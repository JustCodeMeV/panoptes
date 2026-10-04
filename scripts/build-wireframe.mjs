// Builds the globe's zoom-in wireframe detail from Natural Earth (public domain) GeoJSON.
// Usage: node scripts/build-wireframe.mjs <dir with ne_*.geojson>  ->  public/wire/*.json
// Each output is { rivers, lakes, admin, parks }: lists of lines, each a flat delta-encoded
// array of [lon, lat] in 1/1000 degree.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const Q = 1000

function lines(file) {
  const out = []
  const gj = JSON.parse(readFileSync(join(dir, `${file}.geojson`), 'utf8'))
  for (const f of gj.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'LineString') out.push(g.coordinates)
    else if (g.type === 'MultiLineString' || g.type === 'Polygon') out.push(...g.coordinates)
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) out.push(...p)
  }
  return out
}

/** Drops points closer than `tol` degrees to the last kept one, then delta-encodes. */
function encode(all, tol) {
  const res = []
  for (const line of all) {
    const kept = [line[0]]
    for (let i = 1; i < line.length; i++) {
      const [x, y] = line[i]
      const [px, py] = kept[kept.length - 1]
      if (Math.hypot(x - px, y - py) >= tol || i === line.length - 1) kept.push(line[i])
    }
    if (kept.length < 2) continue
    const flat = []
    let lx = 0
    let ly = 0
    for (const [x, y] of kept) {
      const qx = Math.round(x * Q)
      const qy = Math.round(y * Q)
      flat.push(qx - lx, qy - ly)
      lx = qx
      ly = qy
    }
    res.push(flat)
  }
  return res
}

mkdirSync('public/wire', { recursive: true })
const tiers = {
  '50m': { tol: 0.03, rivers: 'ne_50m_rivers_lake_centerlines', lakes: 'ne_50m_lakes', admin: 'ne_50m_admin_1_states_provinces_lines' },
  '10m': { tol: 0.006, rivers: 'ne_10m_rivers_lake_centerlines', lakes: 'ne_10m_lakes', admin: 'ne_10m_admin_1_states_provinces_lines', parks: 'ne_10m_parks_and_protected_lands_area' },
}
for (const [name, t] of Object.entries(tiers)) {
  const out = {}
  for (const k of ['rivers', 'lakes', 'admin', 'parks']) out[k] = t[k] ? encode(lines(t[k]), t.tol) : []
  const json = JSON.stringify(out)
  writeFileSync(`public/wire/detail-${name}.json`, json)
  console.log(name, (json.length / 1e6).toFixed(2), 'MB', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])))
}
