import { create } from 'zustand'
import type { Edge, Entity, Subgraph, TransformDef } from '../../shared/entities'

type Inspect = { entity: Entity; transforms: TransformDef[]; degree: number }

type State = {
  open: boolean
  entities: Record<string, Entity>
  edges: Record<string, Edge>
  selected: string | null
  inspect: Inspect | null
  busy: string | null
  error: string | null
  /** Start (or extend) an investigation from any map item. */
  seed(featureId: string): Promise<void>
  /** Start from an entity id (e.g. an event in the events layer). */
  seedEntity(id: string): Promise<void>
  expand(id: string, transform: string): Promise<void>
  select(id: string | null): Promise<void>
  remove(id: string): void
  clear(): void
  close(): void
}

const merge = (s: State, g: Subgraph) => ({
  entities: { ...s.entities, ...Object.fromEntries(g.entities.map((e) => [e.id, e])) },
  edges: { ...s.edges, ...Object.fromEntries(g.edges.map((e) => [e.id, e])) },
})

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j as T
}

/** The open investigation: a growing subgraph the analyst expands with transforms. */
export const useInvestigation = create<State>((set, getState) => ({
  open: false,
  entities: {},
  edges: {},
  selected: null,
  inspect: null,
  busy: null,
  error: null,
  async seed(featureId) {
    const entityId = featureId.startsWith('events:') ? featureId.slice(7) : null
    if (entityId) return getState().seedEntity(entityId)
    set({ open: true, busy: 'Reading the item…', error: null })
    try {
      const g = await get<Subgraph>(`/api/entities/seed/${encodeURIComponent(featureId)}`)
      set((s) => ({ ...merge(s, g), busy: null }))
      const ev = g.entities.find((e) => e.type === 'event')
      if (ev) void getState().select(ev.id)
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async seedEntity(id) {
    set({ open: true, busy: 'Loading…', error: null })
    try {
      const g = await get<Subgraph>(`/api/entities/${encodeURIComponent(id)}/transform`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'sources' }) })
      const more = await get<Subgraph>(`/api/entities/${encodeURIComponent(id)}/transform`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'actors' }) })
      const loc = await get<Subgraph>(`/api/entities/${encodeURIComponent(id)}/transform`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'location' }) }).catch(() => ({ entities: [], edges: [] }))
      set((s) => ({ ...merge(merge(merge(s, g) as State, more) as State, loc), busy: null }))
      void getState().select(id)
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async expand(id, transform) {
    set({ busy: 'Running transform…', error: null })
    try {
      const g = await get<Subgraph>(`/api/entities/${encodeURIComponent(id)}/transform`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: transform }) })
      set((s) => ({ ...merge(s, g), busy: null, error: g.edges.length ? null : 'Nothing found for this transform' }))
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async select(id) {
    set({ selected: id, inspect: id ? (getState().inspect?.entity.id === id ? getState().inspect : null) : null })
    if (!id) return
    try {
      const i = await get<Inspect>(`/api/entities/${encodeURIComponent(id)}`)
      if (getState().selected === id) set({ inspect: i })
    } catch {
      const e = getState().entities[id]
      if (e) set({ inspect: { entity: e, transforms: [], degree: 0 } })
    }
  },
  remove(id) {
    set((s) => {
      const entities = { ...s.entities }
      delete entities[id]
      const edges = Object.fromEntries(Object.entries(s.edges).filter(([, e]) => e.from !== id && e.to !== id))
      return { entities, edges, selected: s.selected === id ? null : s.selected, inspect: s.selected === id ? null : s.inspect }
    })
  },
  clear: () => set({ entities: {}, edges: {}, selected: null, inspect: null, error: null }),
  close: () => set({ open: false }),
}))

/** Ask the globe to fly somewhere (GlobeOverlay listens). */
export const flyTo = (lat: number, lon: number) => window.dispatchEvent(new CustomEvent('panoptes:flyto', { detail: { lat, lon } }))
