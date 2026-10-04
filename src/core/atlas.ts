import { create } from 'zustand'
import type { Feature } from '../../shared/feature'
import { geoContains, type GeoPermissibleObjects } from 'd3-geo'
import { centreOf, countryAtPoint, shapeOf } from '../globe/countryShapes'

export type Lens = 'none' | 'diplomacy' | 'trade' | 'stability'

/** Country atlas state: the open country and the active map mode. */
export type Region = { name: string; code?: string; geometry: NonNullable<Feature['geometry']> }
type AtlasState = { lens: Lens; setLens: (l: Lens) => void; regions: { country: string; list: Region[] } | null; regionsLoading: string | null }
export const useAtlas = create<AtlasState>((set) => ({ lens: 'diplomacy', setLens: (lens) => set({ lens }), regions: null, regionsLoading: null }))

/** Atlas outlines that stay when a map mode repaints: the country, its regions, the open region or city. */
const KEEP = new Set(['selected', 'region', 'region-selected', 'city'])

const now = () => new Date().toISOString()

/** A map feature for a country outline (layer `atlas`), optionally tinted for a map mode. */
export function countryFeature(name: string, opts: { id?: string; color?: string; alpha?: number; role?: string } = {}): Feature | null {
  const s = shapeOf(name)
  if (!s) return null
  return {
    id: opts.id ?? `atlas:${name}`,
    layerId: 'atlas',
    title: name,
    position: centreOf(s),
    geometry: s.geometry,
    geoPrecision: 'exact',
    geoBasis: 'country boundary (Natural Earth 1:110m)',
    observedAt: now(),
    source: { provider: 'atlas', platform: 'factbook', retrievedAt: now() },
    tags: ['atlas'],
    props: { country: name, color: opts.color, alpha: opts.alpha, role: opts.role ?? 'selected' },
  }
}

// The store imports the layer registry, which imports this module: load it lazily to avoid the cycle.
const store = () => import('./store').then((m) => m.useStore)

/** Opens a country: outline on the globe, profile in the analysis panel, then its regions. */
export async function openCountry(name: string) {
  const st = (await store()).getState()
  const old = (st.layers.atlas?.pinned ?? []).map((f) => f.id)
  if (old.length) st.removeFeatures('atlas', old)
  const f = countryFeature(name)
  if (f) st.pin(f)
  void loadRegions(name)
}

const regionFeature = (country: string, r: Region, selected = false): Feature => ({
  id: `${selected ? 'atlas-region-sel' : 'atlas-region'}:${country}|${r.name}`,
  layerId: 'atlas',
  title: r.name,
  position: centreOf({ name: r.name, geo: r.geometry as GeoPermissibleObjects, geometry: r.geometry }),
  geometry: r.geometry,
  geoPrecision: 'exact',
  geoBasis: 'first-level subdivision (geoBoundaries)',
  observedAt: now(),
  source: { provider: 'atlas', platform: 'geoBoundaries', retrievedAt: now() },
  tags: ['atlas', 'region'],
  props: { country, region: r.name, role: selected ? 'region-selected' : 'region', kind: 'region' },
})

/** Draws the country's regions (states, provinces, oblasts) so a click inside it can open one. */
export async function loadRegions(country: string) {
  if (useAtlas.getState().regions?.country === country) return drawRegions()
  useAtlas.setState({ regionsLoading: country })
  try {
    const r = await fetch(`/api/atlas/regions/${encodeURIComponent(country)}`)
    if (!r.ok) return useAtlas.setState({ regions: { country, list: [] } })
    const j = (await r.json()) as { regions: Region[] }
    useAtlas.setState({ regions: { country, list: j.regions } })
    await drawRegions()
  } finally {
    useAtlas.setState({ regionsLoading: null })
  }
}

async function drawRegions() {
  const useStore = await store()
  const st = useStore.getState()
  const open = (st.layers.atlas?.pinned ?? []).find((f) => f.props.role === 'selected')
  const reg = useAtlas.getState().regions
  if (!open || !reg || reg.country !== open.props.country) return
  const others = (st.layers.atlas?.pinned ?? []).filter((f) => f.props.role !== 'region')
  useStore.setState((s) => ({ layers: { ...s.layers, atlas: { ...s.layers.atlas, pinned: [...others, ...reg.list.map((r) => regionFeature(reg.country, r))], enabled: true } } }))
}

/** The region of the open country under a point, if its regions are loaded. */
export function regionAt(lat: number, lon: number): { country: string; region: Region } | null {
  const reg = useAtlas.getState().regions
  if (!reg) return null
  const region = reg.list.find((r) => geoContains(r.geometry as GeoPermissibleObjects, [lon, lat]))
  return region ? { country: reg.country, region } : null
}

/** Opens a region: highlighted on the globe, its profile in the analysis panel. */
export async function openRegion(country: string, region: Region) {
  const st = (await store()).getState()
  const old = (st.layers.atlas?.pinned ?? []).filter((f) => f.props.role === 'region-selected' || f.props.role === 'city').map((f) => f.id)
  if (old.length) st.removeFeatures('atlas', old)
  st.pin(regionFeature(country, region, true))
}

/** Opens a city: a pin, and its profile (with its region and country) in the analysis panel. */
export async function openCity(name: string, lat: number, lon: number) {
  const st = (await store()).getState()
  const country = countryAtPoint(lat, lon)?.name
  const reg = country && useAtlas.getState().regions?.country === country ? regionAt(lat, lon) : null
  const old = (st.layers.atlas?.pinned ?? []).filter((f) => f.props.role === 'city').map((f) => f.id)
  if (old.length) st.removeFeatures('atlas', old)
  st.pin({
    id: `atlas-city:${name}|${lat}|${lon}`,
    layerId: 'atlas',
    title: name,
    position: { lat, lon },
    geoPrecision: 'exact',
    geoBasis: 'city (Natural Earth populated places)',
    observedAt: now(),
    source: { provider: 'atlas', platform: 'Natural Earth', retrievedAt: now() },
    tags: ['atlas', 'city'],
    props: { role: 'city', kind: 'city', city: name, country, region: reg?.region.name },
  })
}

/** Replaces the map-mode tint around the open country. */
export async function paintLens(features: Feature[]) {
  const useStore = await store()
  const st = useStore.getState()
  const keep = (st.layers.atlas?.pinned ?? []).filter((f) => KEEP.has(String(f.props.role)))
  const lensIds = (st.layers.atlas?.pinned ?? []).filter((f) => !KEEP.has(String(f.props.role))).map((f) => f.id)
  if (lensIds.length) st.removeFeatures('atlas', lensIds)
  useStore.setState((s) => ({ layers: { ...s.layers, atlas: { ...s.layers.atlas, pinned: [...keep, ...features], enabled: true } } }))
}
