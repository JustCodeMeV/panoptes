import { geoCentroid, geoContains, geoArea, type GeoPermissibleObjects } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json'
import type { Feature } from '../../shared/feature'

/** Country outlines (Natural Earth 1:110m) for clicking a country and drawing map modes. */

type Shape = { name: string; geo: GeoPermissibleObjects; geometry: NonNullable<Feature['geometry']> }
const topo = countries110 as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
const SHAPES: Shape[] = feature(topo, topo.objects.countries).features.map((f) => ({ name: f.properties.name, geo: f as GeoPermissibleObjects, geometry: f.geometry as NonNullable<Feature['geometry']> }))

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
// Server / Factbook / gazetteer names -> Natural Earth names.
const ALIAS: Record<string, string> = {
  unitedstates: 'United States of America', usa: 'United States of America', congo: 'Dem. Rep. Congo', democraticrepublicofthecongo: 'Dem. Rep. Congo',
  republicofthecongo: 'Congo', congobrazzaville: 'Congo', southsudan: 'S. Sudan', centralafricanrepublic: 'Central African Rep.',
  bosniaandherzegovina: 'Bosnia and Herz.', equatorialguinea: 'Eq. Guinea', dominicanrepublic: 'Dominican Rep.', solomonislands: 'Solomon Is.',
  westernsahara: 'W. Sahara', ivorycoast: "Côte d'Ivoire", cotedivoire: "Côte d'Ivoire", eswatini: 'eSwatini', northmacedonia: 'Macedonia',
  czechrepublic: 'Czechia', burma: 'Myanmar', westbank: 'Palestine', gaza: 'Palestine', uae: 'United Arab Emirates', uk: 'United Kingdom',
  thebahamas: 'Bahamas', thegambia: 'Gambia', timorleste: 'Timor-Leste', turkiye: 'Turkey',
}
const byNorm = new Map(SHAPES.map((s) => [norm(s.name), s]))

export function shapeOf(name: string): Shape | undefined {
  const n = norm(name)
  return byNorm.get(n) ?? byNorm.get(norm(ALIAS[n] ?? ''))
}

/** Natural Earth country containing a point, or undefined (sea). */
export function countryAtPoint(lat: number, lon: number): Shape | undefined {
  return SHAPES.find((s) => geoContains(s.geo, [lon, lat]))
}

/** Centre of the largest polygon (France in Europe, not between Paris and Guiana). */
export function centreOf(s: Shape): { lat: number; lon: number } {
  const g = s.geometry
  let poly: unknown = g
  if (g.type === 'MultiPolygon') {
    let best = -1
    for (const p of g.coordinates) {
      const a = geoArea({ type: 'Polygon', coordinates: p })
      if (a > best) [best, poly] = [a, { type: 'Polygon', coordinates: p }]
    }
  }
  const [lon, lat] = geoCentroid(poly as GeoPermissibleObjects)
  return { lat, lon }
}
