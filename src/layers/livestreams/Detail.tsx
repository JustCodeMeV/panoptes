import type { Feature } from '../../../shared/feature'

const PRECISION: Record<Feature['geoPrecision'], { label: string; hint: string }> = {
  none: { label: 'UNPLACED', hint: 'No known location' },
  exact: { label: 'EXACT', hint: 'Platform-reported coordinates' },
  approximate: { label: 'APPROX', hint: 'Broadcaster base or coarsened location' },
  inferred: { label: 'INFERRED', hint: 'Guessed from text; may be wrong' },
}

export function LivestreamDetail({ feature }: { feature: Feature }) {
  const p = PRECISION[feature.geoPrecision]
  const viewers = Number(feature.props.viewers)
  return (
    <div className="detail">
      {feature.media?.kind === 'iframe' && (
        <div className="player">
          <iframe
            key={feature.id}
            src={feature.media.url}
            title={feature.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      <h2>{feature.title}</h2>
      <div className="meta">
        {feature.props.channel ? <span>{String(feature.props.channel)}</span> : null}
        {viewers ? <span>{viewers.toLocaleString()} watching</span> : null}
        <span className="platform">{feature.source.platform}</span>
      </div>
      <div className={`geo geo-${feature.geoPrecision}`} title={p.hint}>
        <b>{p.label}</b>
        <span>{feature.geoBasis ?? p.hint}</span>
      </div>
      <dl>
        <dt>Position</dt>
        <dd>
          {feature.position
            ? `${feature.position.lat.toFixed(4)}, ${feature.position.lon.toFixed(4)}`
            : 'unknown'}
        </dd>
        <dt>Source</dt>
        <dd>
          {feature.source.provider}
          {feature.source.url && (
            <>
              {' · '}
              <a href={feature.source.url} target="_blank" rel="noreferrer">
                open original
              </a>
            </>
          )}
        </dd>
        <dt>Retrieved</dt>
        <dd>{new Date(feature.source.retrievedAt).toLocaleTimeString()}</dd>
      </dl>
      {feature.tags.length > 0 && (
        <div className="tags">
          {feature.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
      <p className="note">
        Player blank or blocked? The uploader may disallow embedding. Use &ldquo;open original&rdquo;.
      </p>
    </div>
  )
}
