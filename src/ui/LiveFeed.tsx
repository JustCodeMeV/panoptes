import { useStore } from '../core/store'
import { LAYERS } from '../layers'
import { ago, useNow } from './useNow'

/** Bottom wire: live events from every push layer, newest first. */
export function LiveFeed() {
  const ticker = useStore((s) => s.ticker)
  const live = useStore((s) => s.live)
  const layers = useStore((s) => s.layers)
  const select = useStore((s) => s.select)
  const now = useNow(1000)
  const streams = LAYERS.filter((l) => l.stream)
  if (!streams.length) return null
  const active = streams.filter((l) => layers[l.id].enabled)
  const connected = active.length > 0 && active.some((l) => live[l.id]?.connected)
  const rate = active.reduce((n, l) => n + (live[l.id]?.eventsPerMin ?? 0), 0)
  const last = Math.max(0, ...active.map((l) => live[l.id]?.lastEventAt ?? 0))
  const idle = last ? Math.round((now - last) / 1000) : undefined
  const rows = ticker.filter((t) => layers[t.layerId]?.enabled).slice(0, 6)

  return (
    <div className="wire">
      <div className="wire-head">
        <span className={`live ${connected ? 'on' : ''}`}>
          <i /> {connected ? 'LIVE' : 'RECONNECTING'}
        </span>
        <span className="wire-meta">
          {active.map((l) => l.label).join(' · ')} · {rate} events/min
          {idle !== undefined && idle > 20 ? ` · quiet ${idle}s` : ''}
        </span>
      </div>
      <ol>
        {rows.length === 0 && <li className="empty">Listening… new stories and market moves appear here the moment they happen.</li>}
        {rows.map((t) => {
          const def = LAYERS.find((l) => l.id === t.layerId)
          return (
            <li key={t.key} className={`fresh-${now - t.at < 6000 ? 'y' : 'n'}`}>
              <button onClick={() => select(t.featureId)}>
                <span className="when">{ago(t.at, now)}</span>
                <span className="lyr" style={{ color: def?.color }}>
                  {t.layerId.toUpperCase()}
                </span>
                <span className="vt" style={{ color: t.color }}>
                  {t.badge}
                </span>
                <span className="tt">{t.title}</span>
                <span className="ch">{t.detail}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
