import { create } from 'zustand'
import type { Feature } from '../../shared/feature'

export type CaseRow = { id: number; title: string; created: string; items: number }
export type CaseItem = { id: number; feature_id: string; feature: Feature; note: string; added: string }
export type CaseFull = { id: number; title: string; created: string; items: CaseItem[] }

type S = {
  cases: CaseRow[]
  activeId: number | null
  open: CaseFull | null
  toast?: string
  refresh(): Promise<void>
  create(title: string): Promise<void>
  setActive(id: number | null): Promise<void>
  add(feature: Feature): Promise<void>
  setNote(itemId: number, note: string): Promise<void>
  remove(itemId: number): Promise<void>
}

const j = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

/** Analyst case file: persisted server-side (SQLite). Evidence is a frozen snapshot. */
export const useCases = create<S>((set, get) => ({
  cases: [],
  activeId: Number(localStorage.getItem('panoptes.case')) || null,
  open: null,
  refresh: async () => {
    const cases = (await (await fetch('/api/cases')).json()) as CaseRow[]
    const activeId = get().activeId && cases.some((c) => c.id === get().activeId) ? get().activeId : (cases[0]?.id ?? null)
    set({ cases, activeId })
    if (activeId) set({ open: (await (await fetch(`/api/cases/${activeId}`)).json()) as CaseFull })
    else set({ open: null })
  },
  create: async (title) => {
    const c = (await (await fetch('/api/cases', j('POST', { title }))).json()) as CaseRow
    localStorage.setItem('panoptes.case', String(c.id))
    set({ activeId: c.id })
    await get().refresh()
  },
  setActive: async (id) => {
    if (id) localStorage.setItem('panoptes.case', String(id))
    set({ activeId: id })
    await get().refresh()
  },
  add: async (feature) => {
    let id = get().activeId
    if (!id) {
      await get().create('Untitled case')
      id = get().activeId
    }
    await fetch(`/api/cases/${id}/items`, j('POST', { feature }))
    set({ toast: 'Saved to case' })
    setTimeout(() => set({ toast: undefined }), 2000)
    await get().refresh()
  },
  setNote: async (itemId, note) => {
    await fetch(`/api/items/${itemId}`, j('PATCH', { note }))
  },
  remove: async (itemId) => {
    await fetch(`/api/items/${itemId}`, j('DELETE'))
    await get().refresh()
  },
}))
