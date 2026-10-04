import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { CABLE_GREY } from './props'

export function CableDetail({ feature }: DetailProps) {
  return (
    <SimpleDetail
      feature={feature}
      badge="SUBMARINE CABLE"
      color={CABLE_GREY}
      summary="Undersea cables carry almost all intercontinental internet traffic. Cuts (anchors, sabotage) show up as outages in the OSINT layer; check both when a region goes dark."
      rows={[]}
    />
  )
}
