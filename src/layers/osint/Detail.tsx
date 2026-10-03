import type { Feature } from '../../../shared/feature'
import { SEVERITY } from './severity'

export function OsintDetail({ feature }: { feature: Feature }) {
  const p = feature.props as { category: string; severity: keyof typeof SEVERITY; summary?: string; magnitude?: string; feed: string }
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: SEVERITY[p.severity] }}>
        <b>{p.severity.toUpperCase()} · {p.category.toUpperCase()}</b>
        <span>{p.feed}{p.magnitude ? ` · ${p.magnitude}` : ''}</span>
      </div>
      <h2>{feature.title}</h2>
      {p.summary && <p className="osum">{p.summary}</p>}
      <div className={`geo geo-${feature.geoPrecision}`}>
        <b>{feature.geoPrecision.toUpperCase()}</b>
        <span>{feature.geoBasis}</span>
      </div>
      <dl>
        <dt>Position</dt>
        <dd>{feature.position ? `${feature.position.lat.toFixed(3)}, ${feature.position.lon.toFixed(3)}` : 'unknown'}</dd>
        <dt>Observed</dt>
        <dd>{new Date(feature.observedAt).toLocaleString()}</dd>
        <dt>Source</dt>
        <dd>
          {feature.source.platform}
          {feature.source.url && <> · <a href={feature.source.url} target="_blank" rel="noreferrer">open original</a></>}
        </dd>
      </dl>
    </div>
  )
}
