import { create } from 'zustand'
import type { Feature } from '../../shared/feature'
import { centreOf, shapeOf } from '../globe/countryShapes'

export type Lens = 'none' | 'diplomacy' | 'trade' | 'stability'

/** Country atlas state: the open country and the active map mode. */
export const useAtlas = create<{ lens: Lens; setLens: (l: Lens) => void }>((set) => ({ lens: 'diplomacy', setLens: (lens) => set({ lens }) }))

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

/** Opens a country: outline on the globe, profile in the analysis panel. */
export async function openCountry(name: string) {
  const st = (await store()).getState()
  const old = (st.layers.atlas?.pinned ?? []).map((f) => f.id)
  if (old.length) st.removeFeatures('atlas', old)
  const f = countryFeature(name)
  if (f) st.pin(f)
}

/** Replaces the map-mode tint around the open country. */
export async function paintLens(features: Feature[]) {
  const useStore = await store()
  const st = useStore.getState()
  const keep = (st.layers.atlas?.pinned ?? []).filter((f) => f.props.role === 'selected')
  const lensIds = (st.layers.atlas?.pinned ?? []).filter((f) => f.props.role !== 'selected').map((f) => f.id)
  if (lensIds.length) st.removeFeatures('atlas', lensIds)
  useStore.setState((s) => ({ layers: { ...s.layers, atlas: { ...s.layers.atlas, pinned: [...keep, ...features], enabled: true } } }))
}
