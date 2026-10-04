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
  /** What the last transform did. */
  status: string | null
  /** Start from a country (atlas). */
  seedCountry(name: string): Promise<void>
  /** Start (or extend) an investigation from any map item. */
  seed(featureId: string): Promise<void>
  /** Start from an entity id (e.g. an event in the events layer). */
  seedEntity(id: string): Promise<void>
  /** A region or city opened in the atlas. */
  seedPlace(p: { name: string; kind: 'region' | 'city'; lat: number; lon: number; country?: string; region?: string }): Promise<void>
  expand(id: string, transform: string): Promise<void>
  /** Ask Claude to read this event now (precise place, actor roles, claims). */
  readAI(id: string): Promise<void>
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
  status: null,
  async seedCountry(name) {
    set({ open: true, busy: `Opening ${name}…`, error: null, status: null })
    try {
      const i = await get<Inspect>(`/api/entities/country/${encodeURIComponent(name)}`)
      set((s) => ({ entities: { ...s.entities, [i.entity.id]: i.entity }, busy: null }))
      await getState().select(i.entity.id)
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async seed(rawId) {
    // Region-watch alerts wrap the original item: watch:<watch id>:<original id>.
    const featureId = rawId.replace(/^watch:[^:]+:/, '')
    if (featureId.startsWith('atlas:')) return getState().seedCountry(featureId.slice(6))
    if (featureId.startsWith('atlas-region-sel:') || featureId.startsWith('atlas-city:')) {
      // Lazy: the store imports the layer registry, which imports this module
      const f = (await import('./store')).useStore.getState().layers.atlas?.pinned.find((x) => x.id === featureId)
      if (f?.position) {
        const p = f.props as { kind: 'region' | 'city'; region?: string; city?: string; country?: string }
        return getState().seedPlace({ name: (p.kind === 'city' ? p.city : p.region) ?? f.title, kind: p.kind, lat: f.position.lat, lon: f.position.lon, country: p.country, region: p.kind === 'city' ? p.region : undefined })
      }
    }
    const entityId = featureId.startsWith('events:') ? featureId.slice(7) : null
    if (entityId) return getState().seedEntity(entityId)
    set({ open: true, busy: 'Reading the item…', error: null })
    try {
      const g = await get<Subgraph>(`/api/entities/seed/${encodeURIComponent(featureId)}`)
      set((s) => ({ ...merge(s, g), busy: null, status: g.status ?? null }))
      const main = g.entities.find((e) => e.type === 'event') ?? g.entities.find((e) => ((e.props.featureId as string) ?? '') === featureId) ?? g.entities[0]
      if (main) void getState().select(main.id)
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async seedPlace(p) {
    set({ open: true, busy: `Opening ${p.name}…`, error: null })
    try {
      const g = await get<Subgraph>('/api/entities/place', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) })
      set((s) => ({ ...merge(s, g), busy: null, status: g.status ?? null }))
      const main = g.entities.find((e) => e.label === p.name) ?? g.entities[0]
      if (main) void getState().select(main.id)
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
    // Client-side transform: open the country atlas for a country entity.
    if (transform === 'open-atlas') {
      const e = getState().entities[id]
      if (e) void import('./atlas').then((m) => m.openCountry(e.label, e.position))
      set({ status: `opened the atlas for ${e?.label ?? 'this country'}` })
      return
    }
    set({ busy: 'Running transform…', error: null })
    try {
      const g = await get<Subgraph>(`/api/entities/${encodeURIComponent(id)}/transform`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: transform }) })
      set((s) => ({ ...merge(s, g), busy: null, status: g.status ?? (g.edges.length ? `${g.edges.length} relations` : 'nothing found') }))
      void getState().select(id)
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async readAI(id) {
    set({ busy: 'Claude is reading the reports…', error: null })
    try {
      await get(`/api/llm/extract/${encodeURIComponent(id)}`, { method: 'POST' })
      for (const t of ['actors', 'claims', 'location']) await getState().expand(id, t)
      set({ busy: null })
      await getState().select(id)
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async select(id) {
    set({ selected: id, inspect: id ? (getState().inspect?.entity.id === id ? getState().inspect : null) : null })
    if (!id) return
    const local = getState().entities[id]
    // Demo-replay entities exist only in the browser.
    if (local && id.includes(':demo-')) return set({ inspect: { entity: local, transforms: [], degree: 0 } })
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
  clear: () => set({ entities: {}, edges: {}, selected: null, inspect: null, error: null, status: null }),
  close: () => set({ open: false }),
}))

/** Ask the globe to fly somewhere (GlobeOverlay listens). */
export const flyTo = (lat: number, lon: number) => window.dispatchEvent(new CustomEvent('panoptes:flyto', { detail: { lat, lon } }))
