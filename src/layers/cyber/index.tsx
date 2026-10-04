import type { LayerDef } from '../../core/types'
import { CyberBoard } from './Board'
import { CyberDetail } from './Detail'
import { CYBER_COLOR } from './props'

/** Cyber threats: ransomware claims, botnet command servers, newly exploited vulnerabilities. */
export const cyber: LayerDef = {
  id: 'cyber',
  group: 'Cyber & infrastructure',
  label: 'Cyber Threats',
  description: 'Ransomware victims claimed on leak sites (ransomware.live), botnet command servers (abuse.ch), and vulnerabilities exploited in the wild (CISA). Victims are pinned at their country.',
  color: '#e879f9',
  refreshMs: 10 * 60_000,
  defaultEnabled: false,
  pin: (f) => ({ size: f.props.kind === 'c2' ? 12 + Math.min(10, Number(f.props.servers) * 2) : 13, color: CYBER_COLOR[String(f.props.kind)], glyph: f.props.kind === 'ransomware' ? 'alert' : 'pulse' }),
  rank: (f) => Date.parse(f.observedAt),
  subtitle: (f) => (f.props.kind === 'ransomware' ? `${String(f.props.group)} · ${String(f.props.sector ?? 'sector n/a')} · ${String(f.props.country ?? '?')}` : f.props.kind === 'c2' ? `${String(f.props.malware)} · ${String(f.props.servers)} servers` : `${String(f.props.cve)} · ${String(f.props.vendor)}`),
  Controls: CyberBoard,
  Detail: CyberDetail,
}
