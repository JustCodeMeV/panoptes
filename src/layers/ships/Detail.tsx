import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { SHIP_COLOR } from './props'

export function ShipDetail({ feature }: DetailProps) {
  const p = feature.props
  return (
    <SimpleDetail
      feature={feature}
      badge={`SHIP · ${String(p.shipType ?? 'unknown type').toUpperCase()}${p.dark ? ' · WENT DARK' : ''}`}
      sub={`MMSI ${String(p.mmsi)} · ${String(p.zone)}`}
      color={p.dark ? '#ef4444' : (SHIP_COLOR[String(p.shipType)] ?? '#94a3b8')}
      summary={
        p.dark
          ? `No AIS report for ${String(p.lastSeenMin)} min inside a monitored chokepoint. Ships switch AIS off to hide (sanctions evasion, military movement), but gaps also come from receiver coverage: a lead to check, not proof.`
          : 'Live AIS position report. AIS is self-reported by the vessel and can be spoofed.'
      }
      rows={[
        ['Speed', p.speedKn !== undefined ? `${String(p.speedKn)} kn` : undefined],
        ['Course', p.course !== undefined ? `${Math.round(Number(p.course))}°` : undefined],
        ['Destination', p.destination ? String(p.destination) : undefined],
        ['Last report', `${String(p.lastSeenMin)} min ago`],
      ]}
    />
  )
}
