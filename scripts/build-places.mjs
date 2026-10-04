// Builds the globe's place-name labels from Natural Earth (public domain) GeoJSON.
// Usage: node scripts/build-places.mjs <dir with ne_*.geojson>  ->  public/places.json
// { countries: [name, lon, lat, minZoom][], cities: [name, lon, lat, minZoom, capital (0|1)][] }
// minZoom is the web-map zoom a label first appears at, as Natural Earth ranks them.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const read = (f) => JSON.parse(readFileSync(join(dir, `${f}.geojson`), 'utf8')).features.map((x) => x.properties)
const r2 = (n) => Math.round(n * 100) / 100

const countries = read('ne_50m_admin_0_countries').map((p) => [p.NAME, r2(p.LABEL_X), r2(p.LABEL_Y), p.MIN_LABEL])
const cities = read('ne_10m_populated_places_simple')
  .filter((p) => p.min_zoom <= 8)
  .sort((a, b) => a.min_zoom - b.min_zoom || b.pop_max - a.pop_max)
  .map((p) => [p.name, r2(p.longitude), r2(p.latitude), p.min_zoom, p.adm0cap ? 1 : 0])

const json = JSON.stringify({ countries, cities })
writeFileSync('public/places.json', json)
console.log(countries.length, 'countries,', cities.length, 'cities,', (json.length / 1e3).toFixed(0), 'kB')
