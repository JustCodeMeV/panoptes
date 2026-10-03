import type { Feature } from '../../../shared/feature'
import type { ReviewVerdict } from '../../../shared/truth'
import { VERDICT, assessmentOf } from './verdict'

const REVIEW_COLOR: Record<ReviewVerdict, string> = {
  false: '#d946ef',
  misleading: '#f97316',
  true: '#22c55e',
  analysis: '#f97316',
  reviewed: '#64748b',
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '')

export function NarrativeDetail({ feature }: { feature: Feature }) {
  const a = assessmentOf(feature)
  const v = VERDICT[a.verdict]
  const c = a.coverage
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: v.color }}>
        <b>{v.label}</b>
        <span>{v.blurb}</span>
      </div>
      <div className="risk" title="Attention priority, not a probability that the claim is false">
        <i style={{ width: `${a.risk}%`, background: v.color }} />
        <span>attention {a.risk}/100</span>
      </div>

      <h2>{feature.title}</h2>

      <h3>Why this verdict</h3>
      <ul className="reasons">
        {a.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <h3>Fact-checks ({a.factChecks.length})</h3>
      {a.factChecks.length === 0 ? (
        <p className="empty">No matching published fact-check found in the monitored feeds.</p>
      ) : (
        <ul className="evidence">
          {a.factChecks.map((m) => (
            <li key={m.url}>
              <span className="chip" style={{ background: REVIEW_COLOR[m.verdict] }}>
                {m.verdict}
              </span>
              <a href={m.url} target="_blank" rel="noreferrer">
                {m.title}
              </a>
              <small>
                {m.publisher} · {Math.round(m.score * 100)}% match {m.date ? `· ${when(m.date)}` : ''}
              </small>
            </li>
          ))}
        </ul>
      )}

      <h3>News coverage {c ? `(last ${c.window})` : ''}</h3>
      {!c ? (
        <p className="empty">Coverage data not available (yet).</p>
      ) : (
        <>
          <p className="stats">
            {c.total} article{c.total === 1 ? '' : 's'} · {c.domains} domain{c.domains === 1 ? '' : 's'}
            {c.countries.length ? ` · ${c.countries.length} countries` : ''}
          </p>
          <div className="tags">
            {c.establishedOutlets.map((d) => (
              <span key={d} className="ok">
                {d}
              </span>
            ))}
            {c.stateOutlets.map((d) => (
              <span key={d} className="warn" title="State-affiliated outlet">
                ⚑ {d}
              </span>
            ))}
          </div>
          <ul className="evidence">
            {c.articles.map((x) => (
              <li key={x.url}>
                <a href={x.url} target="_blank" rel="noreferrer">
                  {x.title}
                </a>
                <small>
                  {x.domain}
                  {x.country ? ` · ${x.country}` : ''}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}

      {a.signals.length > 0 && (
        <>
          <h3>Signals ({a.spread} feeds)</h3>
          <ul className="evidence">
            {a.signals.slice(0, 8).map((s, i) => (
              <li key={i}>
                <span className="chip">{s.platform}</span>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.text}
                  </a>
                ) : (
                  <span>{s.text}</span>
                )}
                <small>
                  {s.region ?? ''} {s.volume ? `· ${s.volume.toLocaleString()} traffic` : ''}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={`geo geo-${feature.geoPrecision}`}>
        <b>{feature.geoPrecision === 'none' ? 'UNPLACED' : feature.geoPrecision.toUpperCase()}</b>
        <span>{feature.geoBasis}</span>
      </div>
      <p className="note">
        Evidence summary built by automated retrieval and keyword heuristics, not a ruling on truth.
        Verdicts are inferred from fact-checkers&rsquo; own headlines. Verify against the linked primary sources.
      </p>
    </div>
  )
}
