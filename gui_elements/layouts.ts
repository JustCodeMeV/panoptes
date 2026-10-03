// Panel placement per screen layout (catalog "Screen layout"), as percentages of a 1440px-wide
// reference screen, plus where the globe sits when panels float over it or are docked beside it.
export type LayoutRect = { x: number; y: number; w: number; h: number; k: 'panel' | 'dock' | 'bar' | 'card' | 'rail' | 'tab' }
type GlobeSpot = { cx: number; cy: number; r: number }

export const LAYOUTS: { panels: LayoutRect[]; float: GlobeSpot; docked: GlobeSpot }[] = [
  { panels: [{ x: 1.5, y: 3, w: 23, h: 94, k: 'panel' }, { x: 74.5, y: 3, w: 24, h: 94, k: 'dock' }], float: { cx: 50, cy: 50, r: 34 }, docked: { cx: 50, cy: 50, r: 25 } },
  { panels: [{ x: 1.5, y: 3, w: 24, h: 52, k: 'panel' }, { x: 1.5, y: 57, w: 24, h: 40, k: 'dock' }], float: { cx: 55, cy: 50, r: 36 }, docked: { cx: 63, cy: 50, r: 32 } },
  { panels: [{ x: 0, y: 0, w: 100, h: 8, k: 'bar' }, { x: 3, y: 66, w: 94, h: 34, k: 'dock' }], float: { cx: 50, cy: 46, r: 34 }, docked: { cx: 50, cy: 37, r: 24 } },
  { panels: [{ x: 0, y: 0, w: 100, h: 9, k: 'bar' }, { x: 73, y: 12, w: 25.5, h: 85, k: 'dock' }], float: { cx: 45, cy: 54, r: 34 }, docked: { cx: 37, cy: 54, r: 30 } },
  { panels: [{ x: 2, y: 4, w: 20, h: 34, k: 'card' }, { x: 2, y: 62, w: 20, h: 34, k: 'card' }, { x: 77, y: 22, w: 21, h: 56, k: 'card' }, { x: 36, y: 86, w: 28, h: 10, k: 'card' }], float: { cx: 50, cy: 47, r: 34 }, docked: { cx: 50, cy: 45, r: 28 } },
  { panels: [{ x: 0, y: 0, w: 30, h: 48, k: 'panel' }, { x: 0, y: 49, w: 30, h: 51, k: 'dock' }], float: { cx: 62, cy: 50, r: 38 }, docked: { cx: 65, cy: 50, r: 33 } },
  { panels: [{ x: 0, y: 0, w: 100, h: 8, k: 'bar' }, { x: 0, y: 92, w: 100, h: 8, k: 'bar' }, { x: 1, y: 10, w: 17, h: 80, k: 'panel' }, { x: 82, y: 10, w: 17, h: 80, k: 'dock' }], float: { cx: 50, cy: 50, r: 34 }, docked: { cx: 50, cy: 50, r: 30 } },
  { panels: [{ x: 0, y: 0, w: 4, h: 100, k: 'rail' }, { x: 97, y: 40, w: 3, h: 20, k: 'tab' }], float: { cx: 50, cy: 50, r: 44 }, docked: { cx: 51, cy: 50, r: 42 } },
]
