import type { Assessment } from '../../../shared/truth'
import type { LayerDef } from '../../core/types'
import { NarrativeDetail } from '../narratives/Detail'

const camp = (f: { props: Record<string, unknown> }) => (f.props.assessment as Assessment).campaign

/** Stories whose spread pattern looks coordinated or anomalous. Derived from the live wire. */
export const campaigns: LayerDef = {
  id: 'campaigns',
  label: 'Campaign watch',
  description: 'Stories with suspicious spread patterns: state media first, aligned state outlets, social surges, contradicted claims.',
  color: '#d946ef',
  refreshMs: 20_000,
  defaultEnabled: true,
  pin: (f) => {
    const s = camp(f)?.score ?? 0
    return { size: Math.round(24 + (s / 100) * 14), color: s >= 60 ? '#ef4444' : s >= 40 ? '#d946ef' : '#a855f7', glyph: 'alert' }
  },
  rank: (f) => camp(f)?.score ?? 0,
  subtitle: (f) => {
    const c = camp(f)
    return `${c?.score ?? 0}/100 · ${c?.flags.map((x) => x.label).join(', ')}`
  },
  Detail: NarrativeDetail,
}
