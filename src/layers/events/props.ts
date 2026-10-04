export const CHECK: Record<string, { color: string; label: string }> = {
  confirmed: { color: '#22c55e', label: 'confirmed' },
  corroborated: { color: '#84cc16', label: 'corroborated' },
  'single-source': { color: '#eab308', label: 'single source' },
  'government-only': { color: '#f97316', label: 'government outlets only' },
  contested: { color: '#e879f9', label: 'contested' },
  debunked: { color: '#ef4444', label: 'debunked' },
}
export type CheckProp = { status: string; reasons: string[]; sources: number; independent: number; countries: number }
