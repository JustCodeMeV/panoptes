import type { LayerDef } from '../../core/types'
import { COLOR } from './colors'
import { HumanitarianDetail } from './Detail'

/** UN OCHA (ReliefWeb) disasters and WHO disease outbreak news. */
export const humanitarian: LayerDef = {
  id: 'humanitarian',
  label: 'Humanitarian & Health',
  group: 'Hazards & humanitarian',
  description: 'Disasters tracked by UN OCHA (ReliefWeb) and WHO Disease Outbreak News, by the country they concern.',
  color: '#38bdf8',
  refreshMs: 600_000,
  pin: (f) => ({ size: f.props.kind === 'outbreak' ? 24 : 21, color: COLOR[String(f.props.kind)], glyph: 'pulse' }),
  legend: Object.entries(COLOR),
  subtitle: (f) => `${String(f.props.kind)} · ${String(f.props.country ?? '')} · ${f.source.platform}`,
  Detail: HumanitarianDetail,
}
