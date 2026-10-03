import type { SourceClass } from '../../../shared/truth'

/** Source-class colours shared by the timeline and the network graph. */
export const CLS: Record<SourceClass, { color: string; label: string }> = {
  established: { color: '#22c55e', label: 'established' },
  state: { color: '#f97316', label: 'state' },
  social: { color: '#38bdf8', label: 'social' },
  other: { color: '#64748b', label: 'other' },
}
