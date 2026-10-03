import type { DetailProps } from '../../core/types'
import { band, type Component } from './props'

export function CiiDetail({ feature }: DetailProps) {
  const p = feature.props
  const score = Number(p.score)
  const b = band(score)
  const delta = p.delta === undefined ? undefined : Number(p.delta)
  const comps = (p.components as Component[]) ?? []
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: b.color }}>
        <b>INSTABILITY · {b.label.toUpperCase()}</b>
        <span>
          #{String(p.rank)} of monitored countries
          {delta !== undefined && delta !== 0 ? ` · ${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} in the last hour` : ''}
        </span>
      </div>
      <h2>
        {String(p.country)} <span className="cii-score">{score}</span>
      </h2>
      <p className="osum">
        A transparent sum of live signals, not a forecast. Each bar saturates so one noisy feed cannot dominate; open the layers to see the evidence.
      </p>
      <ul className="cii-bars">
        {comps.map((c) => (
          <li key={c.id} title={`${c.value} ${c.detail}`}>
            <span>{c.label}</span>
            <i>
              <em style={{ width: `${(c.points / c.max) * 100}%`, background: b.color }} />
            </i>
            <b>
              {c.points.toFixed(0)}/{c.max}
            </b>
            <small>
              {c.value} {c.detail}
            </small>
          </li>
        ))}
      </ul>
    </div>
  )
}
