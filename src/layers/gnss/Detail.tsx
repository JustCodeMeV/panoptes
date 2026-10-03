import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { share, color } from './props'

export function GnssDetail({ feature }: DetailProps) {
  const p = feature.props
  return (
    <SimpleDetail
      feature={feature}
      badge="GNSS INTERFERENCE"
      sub={`${Math.round(share(feature) * 100)}% of aircraft affected · ${String(p.day)}`}
      color={color(share(feature))}
      summary="Aircraft in this cell reported degraded GPS accuracy. Persistent clusters near conflict zones indicate jamming or spoofing (electronic warfare); isolated cells can be equipment faults."
      rows={[['Aircraft', `${String(p.bad)} affected / ${Number(p.bad) + Number(p.good)} total`]]}
    />
  )
}
