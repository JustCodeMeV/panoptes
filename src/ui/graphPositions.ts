export type P = { x: number; y: number }

/** Node positions survive re-renders and transforms (module scope: layout state, not render state). */
export const placed = new Map<string, P>()
/** Positions for saving a case's graph, and restoring them. */
export const graphPositions = () => Object.fromEntries(placed)
export const restorePositions = (p: Record<string, P>) => {
  placed.clear()
  for (const [k, v] of Object.entries(p)) placed.set(k, v)
}
