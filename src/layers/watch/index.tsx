import type { LayerDef } from '../../core/types'
import { WatchControls } from './Controls'
import { WatchDetail } from './Detail'

/** Alerts: anything from any layer that lands inside an analyst-defined region. */
export const watch: LayerDef = {
  id: 'watch',
  label: 'Region watch',
  description: 'Draw a circle around a place; new stories, market moves, unrest and outages inside it raise an alert.',
  color: '#14b8a6',
  refreshMs: 0,
  stream: '/api/stream/watch',
  defaultEnabled: true,
  pin: () => ({ size: 20, glyph: 'alert' }),
  ticker: (f, e) => ({ badge: '◎ ALERT', color: '#14b8a6', detail: e.change ?? String(f.props.watchName) }),
  seed: (fs) => fs.slice(0, 4),
  rank: (f) => Number(f.props.alertedAt) || 0,
  subtitle: (f) => `${String(f.props.watchName)} · ${String(f.props.km)} km · ${String(f.props.originLayer)}`,
  Controls: WatchControls,
  Detail: WatchDetail,
}
