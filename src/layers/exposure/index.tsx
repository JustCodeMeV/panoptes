import type { LayerDef } from '../../core/types'
import { ExposureBoard } from './Board'
import { ExposureDetail } from './Detail'
import { exposureColor } from './props'

/** Exposed infrastructure: how many internet-facing systems of each kind Shodan sees per country. */
export const exposure: LayerDef = {
  id: 'exposure',
  group: 'Jamming, outages & cyber',
  label: 'Exposed Infrastructure',
  description: 'Internet-exposed systems counted by country via Shodan aggregate facets (no query credits): industrial control systems and unsecured cameras. Attack-surface scale only — ARGUS shows counts, never individual hosts, addresses or feeds.',
  color: '#ef4444',
  refreshMs: 6 * 60 * 60_000,
  defaultEnabled: false,
  pin: (f) => ({ size: 12 + Math.min(14, Math.log2(1 + Number(f.props.count)) * 1.6), color: exposureColor(String(f.props.category)), glyph: 'alert' }),
  rank: (f) => Number(f.props.count),
  legend: [
    ['exposed ICS/SCADA', exposureColor('ics')],
    ['unsecured cameras', exposureColor('cameras')],
  ],
  subtitle: (f) => `${Number(f.props.count).toLocaleString()} ${String(f.props.categoryLabel ?? f.props.category).toLowerCase()} · ${String(f.props.country)}`,
  Controls: ExposureBoard,
  Detail: ExposureDetail,
}
