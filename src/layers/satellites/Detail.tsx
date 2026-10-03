import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { GROUP_COLOR } from './props'

export function SatelliteDetail({ feature }: DetailProps) {
  const p = feature.props
  return (
    <SimpleDetail
      feature={feature}
      badge={`SATELLITE · ${String(p.group).toUpperCase()}`}
      sub={`NORAD ${String(p.norad)} · ${String(p.orbit)}`}
      color={GROUP_COLOR[String(p.group)] ?? '#e2e8f0'}
      summary="Position propagated from public orbital elements (CelesTrak, SGP4). Accurate to a few km for recent elements; manoeuvres since the last element set are not reflected."
      rows={[
        ['Altitude', `${String(p.altitudeKm)} km`],
        ['Speed', `${String(p.speedKms)} km/s`],
        ['Inclination', `${String(p.inclination)}°`],
        ['Period', `${String(p.periodMin)} min`],
        ['Int. designator', String(p.intlId)],
      ]}
    />
  )
}

