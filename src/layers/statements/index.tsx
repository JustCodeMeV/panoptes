import type { LayerDef } from '../../core/types'
import { PublicationDetail } from './Detail'

/** Official statements by governments of every bloc and by intergovernmental bodies. */
export const statements: LayerDef = {
  id: 'statements',
  label: 'Official Statements',
  group: 'Information space',
  description:
    'What governments say themselves: foreign and defence ministries and heads of state of every bloc (US, Russia, China, Ukraine, India, Turkey, Iran, Israel, Gulf, Europe, Asia, Africa, Latin America), plus the UN, EU and NATO. Placed where the statement is about, else at the issuer.',
  color: '#fb923c',
  refreshMs: 300_000,
  pin: () => ({ size: 20, glyph: 'news' }),
  subtitle: (f) => `${String(f.props.issuer)} · ${String(f.props.issuerCountry)}`,
  Detail: PublicationDetail,
}
