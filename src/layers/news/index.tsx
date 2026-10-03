import type { LayerDef } from '../../core/types'
import { NarrativeDetail } from '../narratives/Detail'
import { VERDICT, assessmentOf } from '../narratives/verdict'

/** Live wire: stories from continuously polled news feeds, analyzed on arrival. */
export const news: LayerDef = {
  id: 'news',
  label: 'Live wire',
  description:
    'Breaking stories from 22 news feeds, grouped by event and re-analyzed as more outlets pick them up.',
  color: '#38bdf8',
  refreshMs: 0,
  stream: '/api/stream/news',
  defaultEnabled: true,
  pin: (f) => {
    const a = assessmentOf(f)
    return {
      size: Math.round(18 + Math.min(14, Number(f.props.outlets) * 2) + (a.risk / 100) * 6),
      color: VERDICT[a.verdict].color,
      glyph: 'news',
    }
  },
  ticker: (f, e) => {
    const v = VERDICT[assessmentOf(f).verdict]
    return { badge: v.label, color: v.color, detail: e.change ?? e.source }
  },
  rank: (f) => Number(f.props.updatedAt) || 0,
  subtitle: (f) => {
    const a = assessmentOf(f)
    return `${VERDICT[a.verdict].label.toLowerCase()} · ${f.props.outlets} outlet${f.props.outlets === 1 ? '' : 's'} · ${f.source.platform}`
  },
  Detail: NarrativeDetail,
}
