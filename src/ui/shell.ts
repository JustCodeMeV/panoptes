import { create } from 'zustand'
import type { Design } from '../../gui_elements/catalog'
import { LAYOUTS } from '../../gui_elements/layouts'

/**
 * Screen chrome state. The globe area spans the space between the panels; when a panel is
 * minimised the globe area grows into the freed space, carrying the
 * position readout and globe controls with it.
 */
export type Mode = 'brief' | 'map' | 'investigate'
const HASH: Record<Mode, string> = { brief: '', map: '#map', investigate: '#case' }
function initialMode(): Mode {
  if (typeof window === 'undefined') return 'brief'
  const h = window.location.hash
  return h === '#case' ? 'investigate' : h === '#map' || new URLSearchParams(window.location.search).has('demo') || new URLSearchParams(window.location.search).has('showreel') ? 'map' : 'brief'
}

type Shell = {
  leftMin: boolean
  /** The ANALYSIS panel is rolled up. */
  rightMin: boolean
  /** Globe area reaches the right edge: the ANALYSIS panel is minimised. */
  toolOut: boolean
  /** Which view fills the screen: the briefing (default), the globe, or the case workbench. */
  mode: Mode
  /** The globe is hidden (brief or investigate): its rendering pauses. */
  caseMode: boolean
  set: (patch: Partial<Omit<Shell, 'set'>>) => void
}

export const useShell = create<Shell>((set) => ({
  leftMin: false,
  rightMin: false,
  toolOut: false,
  mode: initialMode(),
  caseMode: initialMode() !== 'map',
  set: (patch) => set(patch),
}))

/** Layouts are drawn for a 1440px-wide screen; panels keep that pixel width on any screen. */
const REF_W = 1440
const px = (pct: number) => Math.round((pct / 100) * REF_W)

export type PanelBox = { inset: number; width: number; top: string; height: string }

/** Left panel and dock placement for the design's screen layout (side panels only; falls back to the classic layout). */
export function shellGeometry(d: Design) {
  const sides = (i: number) => {
    const L = LAYOUTS[i]
    const panel = L.panels.find((r) => r.k === 'panel' && r.x + r.w / 2 < 50)
    const dock = L.panels.find((r) => r.k === 'dock' && r.x + r.w / 2 > 50)
    return panel && dock ? { panel, dock } : null
  }
  const { panel, dock } = sides(d.layout) ?? sides(0)!
  const left: PanelBox = { inset: px(panel.x), width: px(panel.w), top: `${panel.y}vh`, height: `${panel.h}vh` }
  const right: PanelBox = { inset: px(100 - dock.x - dock.w), width: px(dock.w), top: `${dock.y}vh`, height: `${dock.h}vh` }
  // "Docked beside globe" keeps the globe in the space between the panels; otherwise it runs under them
  const docked = d.zorder === 1
  return { left, right, freeLeft: docked ? left.inset + left.width : 0, freeRight: docked ? right.inset + right.width : 0 }
}

/** Switches the main view, keeping it in the address bar so a reload stays there. */
export function setMode(mode: Mode) {
  useShell.getState().set({ mode, caseMode: mode !== 'map' })
  history.replaceState(null, '', window.location.pathname + window.location.search + HASH[mode])
}
/** Case mode on = the investigate view; off = the map. */
export const setCaseMode = (on: boolean) => setMode(on ? 'investigate' : 'map')
