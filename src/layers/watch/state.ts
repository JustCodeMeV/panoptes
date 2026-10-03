import { create } from 'zustand'

export type Watch = { id: number; name: string; lat: number; lon: number; radiusKm: number; layers: string[]; created: string }

/** Region watches, shared by the panel controls and the globe circles. */
export const useWatches = create<{ list: Watch[]; error?: string; load(): Promise<void>; add(body: object): Promise<boolean>; remove(id: number): Promise<void> }>((set, get) => ({
  list: [],
  async load() {
    try {
      const r = await fetch('/api/watches')
      set({ list: (await r.json()) as Watch[] })
    } catch {
      /* API down: keep the last list */
    }
  },
  async add(body) {
    const r = await fetch('/api/watches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = (await r.json()) as { error?: string }
    if (!r.ok) {
      set({ error: j.error ?? `HTTP ${r.status}` })
      return false
    }
    set({ error: undefined })
    await get().load()
    return true
  },
  async remove(id) {
    await fetch(`/api/watches/${id}`, { method: 'DELETE' })
    await get().load()
  },
}))
