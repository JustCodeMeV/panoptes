import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { occupied } from './props'

export function FrontDetail({ feature }: DetailProps) {
  return (
    <SimpleDetail
      feature={feature}
      badge={occupied(feature) ? 'OCCUPIED TERRITORY' : 'CONTESTED / UNKNOWN'}
      sub="DeepState map"
      color={occupied(feature) ? '#dc2626' : '#a8a29e'}
      summary="Drawn by DeepState, a Ukrainian OSINT group, from geolocated footage and reports. Partisan but well regarded; lines lag fast-moving fighting by hours to days."
      rows={[['Map version', new Date(Number(feature.props.mapId) * 1000).toLocaleString()]]}
    />
  )
}
