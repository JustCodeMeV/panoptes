import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { exposureColor } from './props'

export function ExposureDetail({ feature }: DetailProps) {
  const p = feature.props
  const cat = String(p.category)
  const label = String(p.categoryLabel ?? cat).toLowerCase()
  return (
    <SimpleDetail
      feature={feature}
      badge={`EXPOSED ${String(p.categoryLabel ?? cat).toUpperCase()}`}
      sub={`${Number(p.count).toLocaleString()} in ${String(p.country)}`}
      color={exposureColor(cat)}
      summary={`Shodan indexes about ${Number(p.count).toLocaleString()} ${label} reachable from the public internet in ${String(p.country)} (${Number(p.total).toLocaleString()} worldwide). This is an aggregate exposure count — the scale of misconfigured, internet-facing systems — not a list of devices, and ARGUS shows no hosts, addresses or feeds.`}
      rows={[
        ['Category', String(p.categoryLabel ?? cat)],
        ['Country', String(p.country)],
        ['Exposed (count)', Number(p.count).toLocaleString()],
        ['Worldwide', Number(p.total).toLocaleString()],
        ['Source', 'Shodan aggregate counts'],
      ]}
    />
  )
}
