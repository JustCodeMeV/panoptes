import type { ReactNode } from 'react'
import type { Feature } from '../../../shared/feature'

/** Shared detail layout for physical-world layers: badge, title, summary, facts, provenance. */
export function SimpleDetail({ feature, badge, sub, color, summary, rows }: { feature: Feature; badge: string; sub?: string; color: string; summary?: ReactNode; rows: [string, ReactNode][] }) {
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: color }}>
        <b>{badge}</b>
        {sub && <span>{sub}</span>}
      </div>
      <h2>{feature.title}</h2>
      {summary && <p className="osum">{summary}</p>}
      <div className={`geo geo-${feature.geoPrecision}`}>
        <b>{feature.geoPrecision.toUpperCase()}</b>
        <span>{feature.geoBasis}</span>
      </div>
      <dl>
        {rows
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        <dt>Observed</dt>
        <dd>{new Date(feature.observedAt).toLocaleString()}</dd>
        <dt>Source</dt>
        <dd>
          {feature.source.platform}
          {feature.source.url && (
            <>
              {' '}
              · <a href={feature.source.url} target="_blank" rel="noreferrer">open original</a>
            </>
          )}
        </dd>
      </dl>
    </div>
  )
}
