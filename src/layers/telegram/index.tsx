import type { LayerDef } from '../../core/types'
import { TelegramDetail } from './Detail'
import { TYPE_COLOR, clusterOf, compact, coordinated } from './props'
import { SwarmControls } from './Swarm'

/** Public Telegram channels read by the scout swarm (server/telegram). */
export const telegram: LayerDef = {
  id: 'telegram',
  group: 'Information space',
  label: 'Telegram Scouts',
  description:
    'Posts from ~70 public Telegram channels from every side (official, newsroom, OSINT, government-funded, partisan), read live by a swarm of scouts. Same text across channels is flagged as coordination; channels others forward are discovered automatically.',
  color: '#2aabee',
  refreshMs: 0,
  stream: '/api/stream/telegram',
  defaultEnabled: true,
  pin: (f) => {
    const views = Number(f.props.views) || 0
    const size = Math.round(12 + Math.min(10, Math.log10(views + 1) * 2))
    return coordinated(f) ? { size: size + 8, color: '#ef4444', glyph: 'alert' } : { size, color: TYPE_COLOR[String(f.props.type)] ?? undefined, glyph: 'pulse' }
  },
  ticker: (f, e) => ({
    badge: `@${String(f.props.handle)}`,
    color: coordinated(f) ? '#ef4444' : (TYPE_COLOR[String(f.props.type)] ?? '#2aabee'),
    detail: e.change ?? e.source,
  }),
  rank: (f) => (clusterOf(f)?.channels.length ?? 0) * 1e13 + Date.parse(f.observedAt),
  subtitle: (f) => {
    const c = clusterOf(f)
    return [`@${String(f.props.handle)}`, compact(f.props.views) && `${compact(f.props.views)} views`, c && c.channels.length >= 2 ? `⚑ on ${c.channels.length} channels` : undefined]
      .filter(Boolean)
      .join(' · ')
  },
  Controls: SwarmControls,
  Detail: TelegramDetail,
}
