import type { Feature } from '../../../shared/feature'
import { COLOR } from './colors'

export function HumanitarianDetail({ feature }: { feature: Feature }) {
  const p = feature.props as { kind: string; summary?: string; org?: string; country?: string; disease?: string }
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: COLOR[p.kind] ?? '#38bdf8' }}>
        <b>{p.kind.toUpperCase()}{p.country ? ` · ${p.country.toUpperCase()}` : ''}</b>
        <span>{feature.source.platform}</span>
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
        <dt>Source</dt>
        <dd>{feature.source.url ? <a href={feature.source.url} target="_blank" rel="noreferrer">open the report</a> : feature.source.platform}</dd>
      </dl>
    </div>
  )
}
