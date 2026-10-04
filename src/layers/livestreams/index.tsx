import type { LayerDef } from '../../core/types'
import { LivestreamDetail } from './Detail'

export const livestreams: LayerDef = {
  id: 'livestreams',
  label: 'Live Streams',
  description: 'Social-media livestreams tied to unrest, protests and breaking events.',
  color: '#ff3b47',
  refreshMs: 60_000,
  defaultEnabled: true,
  pin: (f) => {
    const viewers = Number(f.props.viewers) || 0
    // log-ish scale: 1 viewer ~ 22px, 100k ~ 40px
    return { size: Math.round(22 + Math.min(18, Math.log10(viewers + 1) * 3.6)) }
  },
  subtitle: (f) => {
    const v = Number(f.props.viewers)
    const ch = f.props.channel ? String(f.props.channel) : f.source.platform
    return v ? `${ch} · ${v.toLocaleString()} watching` : ch
  },
  Detail: LivestreamDetail,
}
