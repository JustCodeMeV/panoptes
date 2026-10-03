import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { TYPE_COLOR, str } from './props'

export function AcledDetail({ feature }: DetailProps) {
  const p = feature.props
  return (
    <SimpleDetail
      feature={feature}
      badge={String(p.eventType).toUpperCase()}
      sub={`${String(p.subType)} · ${String(p.date)}`}
      color={TYPE_COLOR[String(p.eventType)] ?? '#ef4444'}
      summary={str(p.notes)}
      rows={[
        ['Context', str(p.context)],
        ['Actor 1', str(p.actor1)],
        ['Actor 2', str(p.actor2)],
        ['Fatalities', Number(p.fatalities) ? String(p.fatalities) : undefined],
        ['Reported by', str(p.sources)],
      ]}
    />
  )
}
