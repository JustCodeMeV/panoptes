import type { LayerDef } from '../../core/types'
import { Controls } from './Controls'
import { NarrativeDetail } from './Detail'
import { VERDICT, assessmentOf } from './verdict'

export const narratives: LayerDef = {
  id: 'narratives',
  group: 'Truth & overview',
  label: 'Truth Sensor',
  description:
    'Trending narratives and fresh debunks, cross-referenced against fact-check feeds and news coverage.',
  color: '#a855f7',
  refreshMs: 120_000,
  defaultEnabled: true,
  pin: (f) => {
    const a = assessmentOf(f)
    return { size: Math.round(22 + (a.risk / 100) * 14), color: VERDICT[a.verdict].color, glyph: 'alert' }
  },
  rank: (f) => assessmentOf(f).risk,
  subtitle: (f) => {
    const a = assessmentOf(f)
    return `${VERDICT[a.verdict].label.toLowerCase()} · risk ${a.risk} · ${f.source.platform}`
  },
  Controls,
  Detail: NarrativeDetail,
}
