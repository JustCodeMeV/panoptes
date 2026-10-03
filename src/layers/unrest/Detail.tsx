import type { DetailProps } from '../../core/types'
import { unrestOf } from '.'

export function UnrestDetail({ feature }: DetailProps) {
  const u = unrestOf(feature)
  const rising = u.trend > 3
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: rising ? '#ef4444' : '#f97316' }}>
        <b>{u.dominant.toUpperCase()}{rising ? ' · RISING' : ''}</b>
        <span>{u.sources} articles · {u.count} coded events · last 12 h</span>
      </div>
      <h2>{feature.title}</h2>
      <h3>Event mix</h3>
      <div className="tags">
        {Object.entries(u.breakdown).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
          <span key={k}>{k} ×{n}</span>
        ))}
      </div>
      <h3>Reporting</h3>
      <ul className="evidence">
        {u.articles.map((a) => (
          <li key={a.url}>
            <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a>
            <small>{new URL(a.url).hostname.replace(/^www\./, '')} · coded as {a.label}</small>
          </li>
        ))}
      </ul>
      <div className={`geo geo-${feature.geoPrecision}`}>
        <b>{feature.geoPrecision.toUpperCase()}</b>
        <span>{feature.geoBasis}</span>
      </div>
      <p className="note">
        Events are coded automatically from news text by GDELT and are noisy: the same article can
        be coded to the wrong place or event type. Treat a hotspot as a lead and read the sources.
        Average tone {u.tone.toFixed(1)}.
      </p>
    </div>
  )
}
