export type Component = { id: string; label: string; value: number; points: number; max: number; detail: string }

/** Score bands: 60+ severe, 40+ high, 20+ elevated. */
export const band = (score: number) =>
  score >= 60 ? { color: '#ef4444', label: 'severe' } : score >= 40 ? { color: '#f97316', label: 'high' } : score >= 20 ? { color: '#eab308', label: 'elevated' } : { color: '#64748b', label: 'low' }
