import type { LayerDef } from '../../core/types'
import { InstabilityDetail } from './HeatDetail'
import { band, heat } from './props'

/** Instability heatmap: where it is unstable, from located signals of several independent kinds. */
export const cii: LayerDef = {
  id: 'cii',
  group: 'Truth & overview',
  label: 'Instability Heatmap',
  description:
    'Where it is unstable, not which country: fighting, protests, front lines, GPS jamming, military aircraft, military warnings, outages and conflict chatter, located on a ~1,800 km² grid. Independent signal types agreeing in one place weigh more. Explainable, not a forecast.',
  color: '#f97316',
  refreshMs: 120_000,
  defaultEnabled: false,
  pin: (f) => ({ size: 16, color: band(Number(f.props.score)).color }),
  shape: (f) => {
    const s = Number(f.props.score)
    // Heat cells: no outline, opacity follows the score; legacy country rows keep their outline
    return heat(f) ? { color: band(s).color, alpha: 0.08 + Math.min(0.5, s / 150), width: 0 } : { color: band(s).color, alpha: 0.12 + Math.min(0.45, s / 160), width: 1 }
  },
  rank: (f) => Number(f.props.score),
  legend: [['severe (60+)', '#ef4444'], ['high (40+)', '#f97316'], ['elevated (20+)', '#eab308'], ['low', '#64748b']],
  subtitle: (f) => {
    if (heat(f)) return `${String(f.props.country ?? 'open water')} · ${((f.props.families as { label: string }[]) ?? []).slice(0, 2).map((x) => x.label).join(' + ')}`
    const d = f.props.delta === undefined ? '' : Number(f.props.delta) > 0 ? ` · ▲${String(f.props.delta)}` : Number(f.props.delta) < 0 ? ` · ▼${Math.abs(Number(f.props.delta))}` : ''
    return `${band(Number(f.props.score)).label}${d}${f.props.drivers ? ` · ${String(f.props.drivers)}` : ''}`
  },
  Detail: InstabilityDetail,
}
