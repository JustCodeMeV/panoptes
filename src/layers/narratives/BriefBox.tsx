import { useState } from 'react'
import type { Feature } from '../../../shared/feature'
import type { Brief } from '../../../shared/truth'

type State = { brief?: Brief; error?: string; loading?: boolean }

/**
 * AI analyst brief, requested on demand (one click) so browsing the wire never
 * spends tokens. A baked `props.brief` (demo replay) is shown without a call.
 */
export function BriefBox({ feature }: { feature: Feature }) {
  const baked = feature.props.brief as Brief | undefined
  const [s, setS] = useState<State>({})

  const run = async () => {
    setS({ loading: true })
    try {
      const res = await fetch('/api/llm/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ feature }) })
      const j = (await res.json()) as Brief & { error?: string }
      setS(res.ok ? { brief: j } : { error: j.error ?? `HTTP ${res.status}` })
    } catch (e) {
      setS({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  const b = baked ?? s.brief
  if (!b)
    return (
      <div className="brief">
        <button className="brief-run" onClick={run} disabled={s.loading}>
          {s.loading ? 'Writing brief…' : '✦ Analyst brief'}
        </button>
        {s.error && <small className="brief-err">AI brief unavailable: {s.error}</small>}
      </div>
    )
  return (
    <div className="brief">
      <h3>
        Analyst brief <span className="brief-tag">AI-generated · check sources</span>
      </h3>
      <p>{b.summary}</p>
      {b.whyFlagged.length > 0 && (
        <ul className="reasons">
          {b.whyFlagged.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {b.frames.length > 0 && (
        <dl className="frames">
          {b.frames.map((x) => (
            <div key={x.actor}>
              <dt>{x.actor}</dt>
              <dd>{x.frame}</dd>
            </div>
          ))}
        </dl>
      )}
      {b.checkNext.length > 0 && (
        <>
          <b className="brief-sub">Check next</b>
          <ol className="reasons">
            {b.checkNext.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </>
      )}
      {b.glosses.length > 0 && (
        <>
          <b className="brief-sub">Translated headlines</b>
          <ul className="reasons">
            {b.glosses.map((g) => (
              <li key={g.source + g.english}>
                <small>{g.source}:</small> {g.english}
              </li>
            ))}
          </ul>
        </>
      )}
      <small className="brief-meta">{b.model}</small>
    </div>
  )
}
