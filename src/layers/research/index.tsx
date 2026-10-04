import type { LayerDef } from '../../core/types'
import { PublicationDetail } from '../statements/Detail'

const OWN_COLOR: Record<string, string> = { state: '#f97316', public: '#38bdf8', private: '#a78bfa' }

/** Think-tank and research-group analyses from every bloc, with who funds them. */
export const research: LayerDef = {
  id: 'research',
  label: 'Research & Analysis',
  group: 'Information space',
  description:
    'Think tanks and research groups of every bloc: ISW, CSIS, RUSI, Chatham House, Carnegie, Crisis Group, Bellingcat, IISS, SIPRI, Valdai, RIAC, CIIS, ORF, MP-IDSA, SETA, Al Jazeera Centre, ISS Africa. Each carries who funds and steers it.',
  color: '#a78bfa',
  refreshMs: 600_000,
  pin: (f) => ({ size: 20, color: OWN_COLOR[String(f.props.own)], glyph: 'news' }),
  subtitle: (f) => `${String(f.props.issuer)} · ${String(f.props.issuerCountry)}`,
  Detail: PublicationDetail,
}
