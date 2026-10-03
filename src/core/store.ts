import { create } from 'zustand'
import type { Feature, LayerResponse } from '../../shared/feature'
import type { LiveEvent } from '../../shared/live'
import { LAYERS } from '../layers'
import type { TickerView } from './types'

export type LiveInfo = { connected: boolean; lastEventAt?: number; eventsPerMin: number }
const LIVE0: LiveInfo = { connected: false, eventsPerMin: 0 }

export type TickerEntry = {
  key: string
  at: number
  kind: 'new' | 'update'
  featureId: string
  layerId: string
  title: string
  badge: string
  color: string
  detail?: string
}

const neutral = (f: Feature, e: { change?: string; source?: string }): TickerView => ({
  badge: String(f.props.verdict ?? '').toUpperCase() || 'EVENT',
  color: '#94a3b8',
  detail: e.change ?? e.source,
})

export type LayerState = {
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
  live: Record<string, LiveInfo>
  ticker: TickerEntry[]
  /** featureId -> arrival time; drives pulse animation on the globe. */
  fresh: Record<string, number>
  setLive(id: string, patch: Partial<LiveInfo>): void
  applyLive(layerId: string, e: LiveEvent): void
  /** Pre-fill the wire with the newest backlog stories so it is never empty on load. */
  seedTicker(layerId: string, features: Feature[]): void
  toggle(id: string): void
  pin(feature: Feature): void
  select(id: string | null): void
  openStack(ids: string[]): void
  setLoading(id: string, loading: boolean): void
  setData(id: string, data: LayerResponse): void
  setError(id: string, error: string): void
  /** Drop features (fetched and pinned) plus their wire rows; used to clean up the demo replay. */
  removeFeatures(layerId: string, ids: string[]): void
}

export const useStore = create<State>((set) => ({
  layers: Object.fromEntries(
    LAYERS.map((l) => [l.id, { pinned: [], enabled: l.defaultEnabled ?? false, loading: false }]),
  ),
  selectedId: null,
  stack: [],
  live: {},
  ticker: [],
  fresh: {},
  setLive: (id, patch) =>
    set((s) => ({ live: { ...s.live, [id]: { ...LIVE0, ...s.live[id], ...patch } } })),
  seedTicker: (layerId, features) =>
    set((s) => {
      if (s.ticker.some((t) => t.layerId === layerId)) return s
      const def = LAYERS.find((l) => l.id === layerId)
      const picked = def?.seed
        ? def.seed(features)
        : [...features].sort((a, b) => Number(b.props.updatedAt ?? 0) - Number(a.props.updatedAt ?? 0)).slice(0, 8)
      const rows = picked
        .map<TickerEntry>((f) => {
          const view = (def?.ticker ?? neutral)(f, { kind: 'new', source: f.source.platform })
          return {
            key: `${f.id}:seed`,
            at: Number(f.props.updatedAt) || Date.parse(f.observedAt),
            kind: 'new',
            featureId: f.id,
            layerId,
            title: f.title,
            ...view,
          }
        })
      return { ticker: [...s.ticker, ...rows].sort((a, b) => b.at - a.at).slice(0, 60) }
    }),
  applyLive: (layerId, e) =>
    set((s) => {
      const ls = s.layers[layerId]
      if (!ls) return s
      const now = Date.now()
      const live = { ...s.live, [layerId]: { ...LIVE0, ...s.live[layerId], connected: true, lastEventAt: now } }
      const base: LayerResponse = ls.data ?? { layerId, generatedAt: new Date().toISOString(), features: [], providers: [] }
      if (e.type === 'status') {
        live[layerId].eventsPerMin = e.eventsPerMin
        return { live, layers: { ...s.layers, [layerId]: { ...ls, data: { ...base, providers: e.providers, generatedAt: new Date().toISOString() } } } }
      }
      if (e.type === 'remove') {
        const gone = new Set(e.ids)
        return { live, layers: { ...s.layers, [layerId]: { ...ls, data: { ...base, features: base.features.filter((f) => !gone.has(f.id)) } } } }
      }
      const f = e.feature
      const exists = base.features.some((x) => x.id === f.id)
      const features = exists ? base.features.map((x) => (x.id === f.id ? f : x)) : [f, ...base.features]
      const def = LAYERS.find((l) => l.id === layerId)
      const view = (def?.ticker ?? neutral)(f, { kind: e.kind, change: e.change, source: e.item?.source })
      const entry: TickerEntry = { key: `${f.id}:${now}`, at: now, kind: e.kind, featureId: f.id, layerId, title: e.item?.title ?? f.title, ...view }
      return {
        live,
        ticker: [entry, ...s.ticker].slice(0, 60),
        fresh: { ...Object.fromEntries(Object.entries(s.fresh).filter(([, t]) => now - t < 20_000)), [f.id]: now },
        layers: { ...s.layers, [layerId]: { ...ls, data: { ...base, features } } },
      }
    }),
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
    set((s) => {
      // A snapshot or poll must not wipe an in-flight demo replay's features.
      const ids = new Set(data.features.map((f) => f.id))
      const demo = (s.layers[id].data?.features ?? []).filter((f) => f.tags.includes('demo') && !ids.has(f.id))
      const merged = demo.length ? { ...data, features: [...demo, ...data.features] } : data
      return { layers: { ...s.layers, [id]: { ...s.layers[id], data: merged, error: undefined, loading: false } } }
    }),
  setError: (id, error) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], error, loading: false } } })),
  removeFeatures: (layerId, ids) =>
    set((s) => {
      const ls = s.layers[layerId]
      if (!ls) return s
      const gone = new Set(ids)
      const data = ls.data && { ...ls.data, features: ls.data.features.filter((f) => !gone.has(f.id)) }
      return {
        layers: { ...s.layers, [layerId]: { ...ls, data, pinned: ls.pinned.filter((f) => !gone.has(f.id)) } },
        ticker: s.ticker.filter((t) => !gone.has(t.featureId)),
        fresh: Object.fromEntries(Object.entries(s.fresh).filter(([id]) => !gone.has(id))),
        selectedId: s.selectedId && gone.has(s.selectedId) ? null : s.selectedId,
        stack: s.stack.filter((id) => !gone.has(id)),
      }
    }),
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
