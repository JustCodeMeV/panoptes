import type { LayerDef } from '../../core/types'
import { UnrestDetail } from './Detail'

export type UnrestProps = {
  count: number
  mentions: number
  sources: number
  dominant: string
  breakdown: Record<string, number>
  tone: number
  trend: number
  articles: { url: string; title: string; label: string; at: number }[]
}
export const unrestOf = (f: { props: Record<string, unknown> }) => f.props as unknown as UnrestProps

const COLOR: Record<string, string> = {
  protest: '#fb923c',
  'armed clash': '#ef4444',
  'mass violence': '#b91c1c',
  assault: '#f43f5e',
  coercion: '#f59e0b',
  'show of force': '#eab308',
}

/** Machine-coded protest/clash hotspots from GDELT event data (real coordinates). */
export const unrest: LayerDef = {
  id: 'unrest',
  group: 'War & security',
  label: 'Unrest Hotspots',
  description: 'Protests, clashes and violence coded from global news (GDELT), clustered by place over the last 12 h.',
  color: '#ef4444',
  refreshMs: 300_000,
  defaultEnabled: true,
  pin: (f) => {
    const u = unrestOf(f)
    return { size: Math.round(20 + Math.min(16, Math.log2(u.sources + 1) * 3)), color: COLOR[u.dominant] ?? '#ef4444', glyph: 'alert' }
  },
  rank: (f) => unrestOf(f).sources + Math.max(0, unrestOf(f).trend) * 3,
  legend: Object.entries(COLOR),
  subtitle: (f) => {
    const u = unrestOf(f)
    return `${u.dominant} · ${u.sources} articles${u.trend > 3 ? ' · rising' : ''}`
  },
  Detail: UnrestDetail,
}
