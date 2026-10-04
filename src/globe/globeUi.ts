import { create } from 'zustand'

/** The home view: whole globe, centred on Europe/Africa/Middle East. */
export const HOME = { lon: 15, lat: 30, height: 20_000_000 }

/** Clusters up to this size fan out on hover; bigger ones zoom in on click. */
export const SPIDER_MAX = 16
export type Spider = { key: string; x: number; y: number; ids: string[] }

/** Globe view state shared between the control stack and the layer renderer. */
export const useGlobeUi = create<{
  /** Real night sky (stars, sun, moon, planets) behind the globe. Off on every load. */
  sky: boolean
  toggleSky: () => void
  /** Country and city names, revealed by zoom. */
  places: boolean
  togglePlaces: () => void
  /** The globe has its imagery and first data: the loader can go and the intro zoom play. */
  ready: boolean
  setReady: (ready: boolean) => void
  /** Day/night terminator and city lights in satellite view. On by default. */
  darkSide: boolean
  toggleDarkSide: () => void
  /** Auto-rotate (Space, the play button, the showreel's ending). */
  spin: boolean
  setSpin: (on: boolean) => void
  /** A hovered pin cluster fanned out around its centre (canvas pixels), or null. */
  spider: Spider | null
  setSpider: (s: Spider | null) => void
}>((set) => ({
  spider: null,
  spin: false,
  setSpin: (spin) => set({ spin }),
  setSpider: (spider) => set({ spider }),
  sky: false,
  places: false,
  ready: false,
  setReady: (ready) => set({ ready }),
  togglePlaces: () => set((s) => ({ places: !s.places })),
  darkSide: true,
  toggleDarkSide: () => set((s) => ({ darkSide: !s.darkSide })),
  toggleSky: () => set((s) => ({ sky: !s.sky })),
}))
