import type { Feature } from '../../shared/feature'

/**
 * TIMELINE: the map as it was at a moment in the past, from what the live layers hold.
 * Layers without history (positions right now, standing polygons, indices) are not filtered.
 */
export const TIMELESS = new Set(['frontlines', 'infrastructure', 'satellites', 'gnss', 'atlas', 'cii', 'finance', 'ships', 'military-air', 'livestreams'])

const at = (f: Feature) => Date.parse(f.observedAt) || 0

/** Features visible at `cursor` (null = live: everything). */
export function atTime(layerId: string, features: Feature[], cursor: number | null): Feature[] {
  if (cursor === null || TIMELESS.has(layerId)) return features
  return features.filter((f) => at(f) <= cursor)
}

/** Time-aware features across the given layers (for the histogram and the range). */
export function timedFeatures(layers: { id: string; features: Feature[] }[]): Feature[] {
  return layers.filter((l) => !TIMELESS.has(l.id)).flatMap((l) => l.features)
}

/** Earliest item (at most 3 days back, the depth of the conflict log) to now. */
export function timeRange(features: Feature[], now = Date.now()): [number, number] {
  let lo = now
  for (const f of features) {
    const t = at(f)
    if (t && t < lo) lo = t
  }
  return [Math.max(lo, now - 3 * 86_400_000), now]
}
