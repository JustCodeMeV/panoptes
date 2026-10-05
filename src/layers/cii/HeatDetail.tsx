import type { DetailProps } from '../../core/types'
import { CiiDetail } from './Detail'
import { band, heat } from './props'

type Fam = { id: string; label: string; points: number }

/** One heatmap cell: how unstable, why (which independent signal families agree), and the evidence. */
export function HeatDetail({ feature, select }: DetailProps) {
  const p = feature.props
  const score = Number(p.score)
  const b = band(score)
  const fams = (p.families as Fam[]) ?? []
  const top = (p.top as { id: string; title: string }[]) ?? []
  const max = Math.max(1, ...fams.map((f) => f.points))
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: b.color }}>
        <b>INSTABILITY · {b.label.toUpperCase()}</b>
        <span>
          {String(p.country ?? 'open water')} · {Number(p.corroboration)} independent kind{Number(p.corroboration) === 1 ? '' : 's'} of evidence
        </span>
      </div>
      <h2>
        Here: <span className="cii-score">{score}</span>
      </h2>
      <p className="osum">
        Where it is unstable, not which country: every located signal of the last days (fading over 24 h) in this ~1,800 km² cell and, at a third of its
        weight, in the cells around it. Several independent signal types agreeing in one place weigh more than one loud feed.
      </p>
      <ul className="cii-bars">
        {fams.map((f) => (
          <li key={f.id}>
            <span>{f.label}</span>
            <i>
              <em style={{ width: `${(f.points / max) * 100}%`, background: b.color }} />
            </i>
          </li>
        ))}
      </ul>
      {top.length > 0 && (
        <ul className="evidence">
          {top.map((x) => (
            <li key={x.id}>
              <button className="atlas-link" onClick={() => select(x.id)}>{x.title}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Heatmap cells; country rows from older snapshots still open. */
export const InstabilityDetail = (p: DetailProps) => (heat(p.feature) ? <HeatDetail {...p} /> : <CiiDetail {...p} />)
