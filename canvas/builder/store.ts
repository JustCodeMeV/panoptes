import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CATEGORIES, type Category, type Design } from '../../gui_elements/catalog'
import { DESIGN } from '../../gui_elements/design'

export const PER_PAGE = 6
export const PAGES = Math.ceil(CATEGORIES.length / PER_PAGE)

// Fingerprint of gui_elements/design.ts. When the file changes (export or hand edit),
// the editor starts from the file instead of an older copy saved in this browser.
const BASE = JSON.stringify(DESIGN)

type State = {
  base: string
  design: Design
  /** Which 6 categories the editor shows. */
  page: number
  set: (key: Category, value: number) => void
  reset: () => void
  setPage: (page: number) => void
}

export const useEditor = create<State>()(
  persist(
    (set, get) => ({
      base: BASE,
      design: { ...DESIGN },
      page: 0,
      set: (key, value) => set({ design: { ...get().design, [key]: value } }),
      reset: () => set({ design: { ...DESIGN } }),
      setPage: (page) => set({ page: (page + PAGES) % PAGES }),
    }),
    {
      name: 'argus-design-editor',
      partialize: ({ base, design, page }) => ({ base, design, page }),
      merge: (saved, current) => {
        const s = saved as { base?: string; design?: Partial<Design>; page?: number } | undefined
        if (!s || s.base !== BASE) return { ...current, page: s?.page ?? 0 }
        return { ...current, page: s.page ?? 0, design: { ...DESIGN, ...s.design } }
      },
    },
  ),
)
