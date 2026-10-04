import type { Feature } from '../../../shared/feature'
import { COLOR } from './colors'


export function WarningDetail({ feature }: { feature: Feature }) {
  const p = feature.props as { category: string; summary?: string; text?: string; kp?: number; domain?: string }
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: COLOR[p.category] ?? '#94a3b8' }}>
        <b>{p.category.toUpperCase()}</b>
        <span>{feature.source.platform}</span>
      </div>
      <h2>{feature.title}</h2>
      {(p.summary || p.text) && <p className="osum">{p.summary ?? p.text}</p>}
      <div className={`geo geo-${feature.geoPrecision}`}>
        <b>{feature.geoPrecision.toUpperCase()}</b>
        <span>{feature.geoBasis}</span>
      </div>
      <dl>
        <dt>Reported</dt>
        <dd>{new Date(feature.observedAt).toLocaleString()}</dd>
        <dt>Source</dt>
        <dd>{feature.source.url ? <a href={feature.source.url} target="_blank" rel="noreferrer">open the original</a> : feature.source.platform}</dd>
      </dl>
    </div>
  )
}
