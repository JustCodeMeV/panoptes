import type { LayerDef } from '../../core/types'
import { EventDetail } from './Detail'
import { CHECK, type CheckProp } from './props'

/** Resolved, checked events from the entity graph: one pin per real-world event, however many reports. */
export const events: LayerDef = {
  id: 'events',
  label: 'Events (Checked)',
  description:
    'Every report of the same event (news, Telegram, conflict log, GDELT) merged into one event, located as precisely as the reports allow and checked: confirmed, corroborated, single source, government outlets only, contested or debunked.',
  color: '#ef4444',
  refreshMs: 60_000,
  defaultEnabled: false,
  pin: (f) => {
    const c = f.props.check as CheckProp
    return { size: Math.round(14 + Math.min(14, c.sources * 1.5)), color: CHECK[c.status]?.color, glyph: c.status === 'contested' || c.status === 'debunked' ? 'alert' : 'pulse' }
  },
  rank: (f) => (f.props.check as CheckProp).sources * 1e12 + Number(f.props.updatedAt),
  subtitle: (f) => {
    const c = f.props.check as CheckProp
    return `${String(f.props.kind).replace('-', ' ')} · ${CHECK[c.status]?.label ?? c.status} · ${c.sources} report${c.sources === 1 ? '' : 's'}`
  },
  Detail: EventDetail,
}
