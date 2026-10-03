import { useEffect, useState } from 'react'
import type { HistoryPoint } from '../../../shared/markets'
import type { DetailProps } from '../../core/types'
import { marketOf, money, moveColor, pct, pts } from './format'

function Spark({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) return <p className="empty">Not enough history yet.</p>
  const W = 400
  const H = 90
  const ps = points.map((x) => x.p)
  const lo = Math.max(0, Math.min(...ps) - 0.02)
  const hi = Math.min(1, Math.max(...ps) + 0.02)
  const t0 = points[0].t
  const span = points[points.length - 1].t - t0 || 1
  const xy = points.map((x) => `${(((x.t - t0) / span) * W).toFixed(1)},${(H - ((x.p - lo) / (hi - lo || 1)) * H).toFixed(1)}`)
  const up = ps[ps.length - 1] >= ps[0]
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={xy.join(' ')} fill="none" stroke={moveColor(up ? 1 : -1)} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <text x="4" y="12">{pct(hi)}</text>
      <text x="4" y={H - 4}>{pct(lo)}</text>
    </svg>
  )
}

export function MarketDetail({ feature, select }: DetailProps) {
  const m = marketOf(feature)
  const [loaded, setLoaded] = useState<{ id: string; points: HistoryPoint[]; source: string } | null>(null)
  const hist = loaded?.id === feature.id ? loaded : null
  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/markets/history?id=${encodeURIComponent(feature.id)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((h: { points: HistoryPoint[]; source: string } | null) => h && setLoaded({ id: feature.id, ...h }))
      .catch(() => undefined)
    return () => ac.abort()
  }, [feature.id])

  const fmt = (n: number) => money(n, m.unit)
  const week = hist && hist.points.length > 1 ? hist.points[hist.points.length - 1].p - hist.points[0].p : undefined
  return (
    <div className="detail market">
      <div className="mhead">
        <div className="big">{pct(m.p)}</div>
        <div>
          <div className="mlabel">{m.headline === 'Yes' ? 'chance: Yes' : m.headline}</div>
          <div className="mmeta">
            {m.platform}
            {m.playMoney ? ' · PLAY MONEY' : ''}
          </div>
        </div>
      </div>
      <div className="bar"><i style={{ width: pct(m.p) }} /></div>
      <h2>{feature.title}</h2>

      <div className="moves">
        {m.change24h !== undefined && <span style={{ color: moveColor(m.change24h) }}>{pts(m.change24h)} / 24h</span>}
        {week !== undefined && <span style={{ color: moveColor(week) }}>{pts(week)} / 7d</span>}
        {m.changeLive ? <span style={{ color: moveColor(m.changeLive) }}>{pts(m.changeLive)} just now</span> : null}
      </div>

      <h3>Price, last 7 days</h3>
      {hist ? <Spark points={hist.points} /> : <p className="empty">Loading history…</p>}
      {hist && <small className="src">{hist.source}</small>}

      <h3>Is the number meaningful?</h3>
      <div className="trust" title="Derived from traded volume. Thin markets are easy to move and noisy.">
        <i style={{ width: `${m.trust}%` }} />
        <span>market depth {m.trust}/100</span>
      </div>
      <dl>
        <dt>24h volume</dt><dd>{fmt(m.volume24h)}</dd>
        <dt>Total volume</dt><dd>{fmt(m.volumeTotal)}</dd>
        {m.liquidity ? (<><dt>Liquidity</dt><dd>{fmt(m.liquidity)}</dd></>) : null}
        {m.endDate ? (<><dt>Closes</dt><dd>{new Date(m.endDate).toLocaleDateString()}</dd></>) : null}
      </dl>

      {m.outcomes.length > 1 && (
        <>
          <h3>Outcomes</h3>
          <ul className="outcomes">
            {m.outcomes.map((o) => (
              <li key={o.label}>
                <span>{o.label}</span>
                <i><b style={{ width: pct(o.p) }} /></i>
                <em>{pct(o.p)}</em>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Related news ({m.related.length})</h3>
      {m.related.length === 0 ? (
        <p className="empty">No live story matches this question yet.</p>
      ) : (
        <ul className="evidence">
          {m.related.map((r) => (
            <li key={r.id}>
              <a href="#" onClick={(e) => { e.preventDefault(); select(r.id) }}>{r.title}</a>
              <small>{r.outlets} outlet{r.outlets === 1 ? '' : 's'} · {r.verdict}</small>
            </li>
          ))}
        </ul>
      )}

      <div className={`geo geo-${feature.geoPrecision}`}>
        <b>{feature.geoPrecision === 'none' ? 'UNPLACED' : feature.geoPrecision.toUpperCase()}</b>
        <span>{feature.geoBasis}</span>
      </div>
      <p className="note">
        A price is the crowd&rsquo;s bet, not a fact: it can be thin, manipulated or simply wrong.
        {m.playMoney ? ' This platform uses play money, so it carries little weight.' : ''}{' '}
        <a href={feature.source.url} target="_blank" rel="noreferrer">Open on {m.platform}</a>
      </p>
    </div>
  )
}
