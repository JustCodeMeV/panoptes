import type { Feature } from '../../../shared/feature'

export type TgCluster = { id: string; size: number; channels: string[]; first: string; firstAt: number; leadMin: number; coordinated?: boolean; recurringPair?: { from: string; to: string; count: number } }

/** Colour per channel type: state-affiliated and partisan sources stand out. */
export const TYPE_COLOR: Record<string, string> = {
  state: '#ef4444',
  milblog: '#f97316',
  gov: '#22c55e',
  media: '#38bdf8',
  osint: '#a78bfa',
}
export const TYPE_LABEL: Record<string, string> = {
  state: 'state-affiliated',
  milblog: 'partisan war blog',
  gov: 'official',
  media: 'newsroom',
  osint: 'OSINT / aggregator',
}

export const clusterOf = (f: Feature) => f.props.cluster as TgCluster | undefined
export const coordinated = (f: Feature) => !!clusterOf(f)?.coordinated || (clusterOf(f)?.channels.length ?? 0) >= 3

export const compact = (n: unknown) => {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return undefined
  return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K` : String(Math.round(v))
}
