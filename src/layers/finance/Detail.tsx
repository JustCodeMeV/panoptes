import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { moveColor, pct, price } from './props'

function Spark({ closes }: { closes: number[] }) {
  if (closes.length < 2) return null
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * 260},${60 - ((c - min) / (max - min || 1)) * 56 - 2}`).join(' ')
  return (
    <svg viewBox="0 0 260 60" className="fin-spark" aria-label="Last month">
      <polyline points={pts} fill="none" stroke={closes[closes.length - 1] >= closes[0] ? '#4ade80' : '#f87171'} strokeWidth="1.8" />
    </svg>
  )
}

export function FinanceDetail({ feature }: DetailProps) {
  const p = feature.props
  const day = Number(p.day)
  return (
    <SimpleDetail
      feature={feature}
      badge={`${String(p.kind).toUpperCase()} · ${pct(p.day)} TODAY`}
      sub={`${String(p.sym)} · ${price(p.price)} ${String(p.currency ?? '')}`}
      color={moveColor(day)}
      summary={
        <>
          <Spark closes={(p.closes as number[]) ?? []} />
          <span className="block">Last month of daily closes. {Math.abs(day) >= 3 ? 'A move of 3% or more in a day: a market shock worth checking against the news.' : ''}</span>
        </>
      }
      rows={[
        ['Today', pct(p.day)],
        ['Week', pct(p.week)],
        ['Month', pct(p.month)],
        ['Country', p.country ? String(p.country) : undefined],
      ]}
    />
  )
}
