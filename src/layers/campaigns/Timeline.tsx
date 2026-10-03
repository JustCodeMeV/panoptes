import type { Campaign, SourceClass } from '../../../shared/truth'
import { CLS } from './classes'

const SEV = { info: '#38bdf8', warn: '#f97316', alert: '#ef4444' } as const

/** Who joined the story, when: a dot per source on a time axis, coloured by class. */
export function CampaignView({ c }: { c: Campaign }) {
  const t0 = c.timeline[0]?.at ?? 0
  const span = Math.max(1, (c.timeline[c.timeline.length - 1]?.at ?? t0) - t0)
  const fmt = (ms: number) => (ms < 90 * 60_000 ? `${Math.round(ms / 60_000)}m` : `${(ms / 3600_000).toFixed(1)}h`)
  return (
    <div className="campaign">
      {c.flags.length === 0 ? (
        <p className="empty">No suspicious spread pattern detected.</p>
      ) : (
        <ul className="flags">
          {c.flags.map((f) => (
            <li key={f.id} style={{ ['--f' as string]: SEV[f.severity] }}>
              <b>⚑ {f.label}</b>
              <span>{f.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="axis" title="Each dot is a source joining the story">
        {c.timeline.map((e, i) => (
          <i key={i} style={{ left: `${((e.at - t0) / span) * 96 + 2}%`, background: CLS[e.cls].color }} title={`${e.source} (${CLS[e.cls].label})`} />
        ))}
      </div>
      <div className="axis-legend">
        {(Object.keys(CLS) as SourceClass[]).map((k) => (
          <span key={k}><i style={{ background: CLS[k].color }} /> {CLS[k].label}</span>
        ))}
        <em>spans {fmt(span)}</em>
      </div>
      <ol className="tl">
        {c.timeline.slice(0, 10).map((e, i) => (
          <li key={i}>
            <span className="at">+{fmt(e.at - t0)}</span>
            <i style={{ background: CLS[e.cls].color }} />
            <a href={e.url} target="_blank" rel="noreferrer">{e.source}{e.bloc ? ` [${e.bloc}]` : ''}</a>
          </li>
        ))}
      </ol>
    </div>
  )
}
