import { create } from 'zustand'
import type { Feature, LayerResponse } from '../../shared/feature'
import { LAYERS } from '../layers'

type LayerState = {
  /** Analyst-created features (e.g. ad-hoc claim checks); survive refreshes. */
  pinned: Feature[]
  enabled: boolean
  loading: boolean
  error?: string
  data?: LayerResponse
}

type State = {
  layers: Record<string, LayerState>
  selectedId: string | null
  /** Features sharing one location, offered as a chooser in the dock. */
  stack: string[]
  toggle(id: string): void
  pin(feature: Feature): void
  select(id: string | null): void
  openStack(ids: string[]): void
  setLoading(id: string, loading: boolean): void
  setData(id: string, data: LayerResponse): void
  setError(id: string, error: string): void
}

export const useStore = create<State>((set) => ({
  layers: Object.fromEntries(
    LAYERS.map((l) => [l.id, { pinned: [], enabled: l.defaultEnabled ?? false, loading: false }]),
  ),
  selectedId: null,
  stack: [],
  toggle: (id) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], enabled: !s.layers[id].enabled } },
    })),
  pin: (feature) =>
    set((s) => {
      const ls = s.layers[feature.layerId]
      if (!ls) return s
      const pinned = [feature, ...ls.pinned.filter((f) => f.id !== feature.id)]
      return {
        selectedId: feature.id,
        stack: [],
        layers: { ...s.layers, [feature.layerId]: { ...ls, pinned, enabled: true } },
      }
    }),
  select: (selectedId) => set((s) => ({ selectedId, stack: selectedId && s.stack.includes(selectedId) ? s.stack : [] })),
  openStack: (ids) => set({ stack: ids, selectedId: ids[0] ?? null }),
  setLoading: (id, loading) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], loading } } })),
  setData: (id, data) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], data, error: undefined, loading: false } },
    })),
  setError: (id, error) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], error, loading: false } } })),
}))

/** Pinned (analyst-created) features first, then fetched ones, deduped by id. */
export function featuresOf(ls: LayerState): Feature[] {
  const seen = new Set<string>()
  return [...ls.pinned, ...(ls.data?.features ?? [])].filter((f) => !seen.has(f.id) && seen.add(f.id))
}

/** Finds the selected feature (and its layer) across all loaded layers. */
export function useSelected(): Feature | null {
  return useStore((s) => {
    if (!s.selectedId) return null
    for (const l of Object.values(s.layers)) {
      const f = featuresOf(l).find((x) => x.id === s.selectedId)
      if (f) return f
    }
    return null
  })
}
