import { create } from 'zustand'
import type { Feature, LayerResponse } from '../../shared/feature'
import { LAYERS } from '../layers'

type LayerState = {
  enabled: boolean
  loading: boolean
  error?: string
  data?: LayerResponse
}

type State = {
  layers: Record<string, LayerState>
  selectedId: string | null
  toggle(id: string): void
  select(id: string | null): void
  setLoading(id: string, loading: boolean): void
  setData(id: string, data: LayerResponse): void
  setError(id: string, error: string): void
}

export const useStore = create<State>((set) => ({
  layers: Object.fromEntries(
    LAYERS.map((l) => [l.id, { enabled: l.defaultEnabled ?? false, loading: false }]),
  ),
  selectedId: null,
  toggle: (id) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], enabled: !s.layers[id].enabled } },
    })),
  select: (selectedId) => set({ selectedId }),
  setLoading: (id, loading) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], loading } } })),
  setData: (id, data) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], data, error: undefined, loading: false } },
    })),
  setError: (id, error) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], error, loading: false } } })),
}))

/** Finds the selected feature (and its layer) across all loaded layers. */
export function useSelected(): Feature | null {
  return useStore((s) => {
    if (!s.selectedId) return null
    for (const l of Object.values(s.layers)) {
      const f = l.data?.features.find((x) => x.id === s.selectedId)
      if (f) return f
    }
    return null
  })
}
