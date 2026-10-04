import type { Feature } from '../../../shared/feature'

const OWN: Record<string, { label: string; color: string }> = {
  state: { label: 'government / state-controlled', color: '#f97316' },
  public: { label: 'public, statutorily independent', color: '#38bdf8' },
  private: { label: 'independent', color: '#22c55e' },
}

/** A statement or an analysis: who issued it, how that issuer is funded and controlled, what it says. */
export function PublicationDetail({ feature }: { feature: Feature }) {
  const p = feature.props as { kind: string; issuer: string; issuerCountry: string; issuerKind: string; own: string; note?: string; summary?: string; about?: string }
  const own = OWN[p.own] ?? OWN.private
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: own.color }}>
        <b>{p.kind === 'analysis' ? 'ANALYSIS' : 'OFFICIAL STATEMENT'} · {p.issuer.toUpperCase()}</b>
        <span>{p.issuerCountry} · {own.label}{p.note ? ` (${p.note})` : ''}</span>
      </div>
      <h2>{feature.title}</h2>
      {p.summary && <p className="osum">{p.summary}</p>}
      <div className={`geo geo-${feature.geoPrecision}`}>
        <b>{feature.geoPrecision.toUpperCase()}</b>
        <span>{feature.geoBasis}</span>
      </div>
      <dl>
        <dt>Published</dt>
        <dd>{new Date(feature.observedAt).toLocaleString()}</dd>
        {p.about && (
          <>
            <dt>About</dt>
            <dd>{p.about}</dd>
          </>
        )}
        <dt>Read</dt>
        <dd>{feature.source.url ? <a href={feature.source.url} target="_blank" rel="noreferrer">open the original</a> : 'no link'}</dd>
      </dl>
      <p className="note">Shown as the issuer's own words: a claim to weigh, not a fact. The same rule applies to every government and every think tank.</p>
    </div>
  )
}
