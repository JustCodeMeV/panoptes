import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Edge, Entity } from '../../shared/entities'
import { flyTo, useInvestigation } from '../core/investigation'
import { useStore } from '../core/store'
import { placed, type P } from './graphPositions'
import { useEscape } from './useEscape'

/**
 * INVESTIGATION CANVAS (Maltego-style). Start from any map item, then expand
 * entities with transforms: who reported it, which actors, what is claimed,
 * what else happened nearby, which ships or aircraft were around. Every
 * located entity can fly the globe to it.
 */

const W = 1000
const H = 560

const TYPE: Record<string, { color: string; glyph: string; label: string }> = {
  event: { color: '#ef4444', glyph: '◆', label: 'event' },
  location: { color: '#22c55e', glyph: '⌖', label: 'location' },
  actor: { color: '#f59e0b', glyph: '●', label: 'actor' },
  source: { color: '#38bdf8', glyph: '▣', label: 'source' },
  claim: { color: '#e879f9', glyph: '❝', label: 'claim' },
  asset: { color: '#a3e635', glyph: '⛴', label: 'asset' },
}
const CHECK_COLOR: Record<string, string> = {
  confirmed: '#22c55e',
  corroborated: '#84cc16',
  'single-source': '#eab308',
  'government-only': '#f97316',
  contested: '#e879f9',
  debunked: '#ef4444',
}
/** Source ring colours: who owns and controls the outlet or channel. */
const OWN_COLOR: Record<string, string> = { state: '#f97316', public: '#38bdf8', private: '#22c55e' }
const REL: Record<string, string> = {
  located_at: 'at', involves: 'involves', reported_by: 'reported by', claims: 'claims', about: 'about', supports: 'supports',
  contradicts: 'contradicts', copies: 'copies', forwards: 'forwards', near: 'near', same_as: 'same gov.', mentions: 'mentions',
}


/** Incremental force layout: existing nodes move little, new ones settle around their neighbours. */
function relayout(prev: Map<string, P>, nodes: Entity[], edges: Edge[]): Map<string, P> {
  const pos = new Map<string, P>()
  const nb = new Map<string, string[]>()
  for (const e of edges) {
    nb.set(e.from, [...(nb.get(e.from) ?? []), e.to])
    nb.set(e.to, [...(nb.get(e.to) ?? []), e.from])
  }
  nodes.forEach((n, i) => {
    const p = prev.get(n.id)
    if (p) return pos.set(n.id, { ...p })
    const anchor = (nb.get(n.id) ?? []).map((x) => prev.get(x)).find(Boolean)
    const a = Math.random() * Math.PI * 2
    pos.set(n.id, anchor ? { x: anchor.x + Math.cos(a) * 90, y: anchor.y + Math.sin(a) * 90 } : { x: W / 2 + Math.cos(i) * 120, y: H / 2 + Math.sin(i) * 120 })
  })
  const ids = nodes.map((n) => n.id)
  const k = Math.min(140, Math.sqrt((W * H) / Math.max(1, ids.length)) * 0.7)
  for (let it = 0; it < 140; it++) {
    const t = 1 - it / 140
    const d = new Map(ids.map((id) => [id, { x: 0, y: 0 }]))
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i])!
        const b = pos.get(ids[j])!
        const dx = a.x - b.x || 0.1
        const dy = a.y - b.y || 0.1
        const f = (k * k) / (dx * dx + dy * dy)
        d.get(ids[i])!.x += dx * f * 0.04
        d.get(ids[i])!.y += dy * f * 0.04
        d.get(ids[j])!.x -= dx * f * 0.04
        d.get(ids[j])!.y -= dy * f * 0.04
      }
    for (const e of edges) {
      const a = pos.get(e.from)
      const b = pos.get(e.to)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (dist - k) * 0.02
      d.get(e.from)!.x += (dx / dist) * f * dist * 0.05
      d.get(e.from)!.y += (dy / dist) * f * dist * 0.05
      d.get(e.to)!.x -= (dx / dist) * f * dist * 0.05
      d.get(e.to)!.y -= (dy / dist) * f * dist * 0.05
    }
    for (const id of ids) {
      const p = pos.get(id)!
      const m = d.get(id)!
      const settled = prev.has(id) ? 0.25 : 1 // keep the analyst's mental map: old nodes barely move
      const len = Math.sqrt(m.x * m.x + m.y * m.y) || 1
      const step = Math.min(len, 30 * t + 2) * settled
      p.x = Math.max(40, Math.min(W - 40, p.x + (m.x / len) * step))
      p.y = Math.max(30, Math.min(H - 30, p.y + (m.y / len) * step))
    }
  }
  return pos
}

function Inspector() {
  const { inspect, expand, remove, busy, readAI } = useInvestigation()
  const select = useStore((s) => s.select)
  if (!inspect) return <p className="inv-empty">Click an entity to inspect it and run transforms.</p>
  const e = inspect.entity
  const t = TYPE[e.type]
  const props = Object.entries(e.props).filter(([k, v]) => v !== undefined && v !== null && v !== '' && typeof v !== 'object' && !['text', 'url', 'summary', 'read', 'readAt'].includes(k))
  const featureIds = (e.props.featureIds as string[] | undefined) ?? (e.props.featureId ? [String(e.props.featureId)] : [])
  return (
    <div className="inv-inspect">
      <span className="inv-type" style={{ color: t.color }}>
        {t.glyph} {t.label} · {e.subtype}
      </span>
      <h4>{e.label}</h4>
      {e.check && (
        <div className="inv-check" style={{ ['--c' as string]: CHECK_COLOR[e.check.status] }}>
          <b>{e.check.status.replace('-', ' ')}</b>
          <ul>
            {e.check.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {e.position && (
        <p className="inv-pos">
          {e.position.lat.toFixed(3)}, {e.position.lon.toFixed(3)} · {e.precision} precision{' '}
          <button onClick={() => flyTo(e.position!.lat, e.position!.lon)}>fly to</button>
        </p>
      )}
      {props.length > 0 && (
        <dl>
          {props.slice(0, 8).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {typeof e.props.url === 'string' && (
        <a href={e.props.url} target="_blank" rel="noreferrer">
          open source
        </a>
      )}
      {e.type === 'event' && (
        <button className="brief-run" disabled={!!busy} onClick={() => void readAI(e.id)} title="Claude reads the reports: precise place, actors and roles, claims (counts toward the hourly AI budget)">
          {e.props.read === 'llm' ? '✦ Re-read with AI' : '✦ Read with AI'}
        </button>
      )}
      {typeof e.props.summary === 'string' && <p className="inv-summary">{e.props.summary}</p>}
      <div className="inv-transforms">
        <span>Transforms</span>
        {inspect.transforms.map((x) => (
          <button key={x.id} disabled={!!busy} onClick={() => void expand(e.id, x.id)}>
            ▸ {x.label}
          </button>
        ))}
      </div>
      <div className="inv-actions">
        {featureIds[0] && <button onClick={() => select(featureIds[0])}>open original item</button>}
        <button onClick={() => remove(e.id)}>remove from canvas</button>
      </div>
    </div>
  )
}

/** The canvas: a floating window over the globe, or `embedded` in the case workbench (with extra panels under the inspector). */
export function Investigation({ embedded = false, aside }: { embedded?: boolean; aside?: ReactNode } = {}) {
  const { open, entities, edges, selected, busy, error, status, select, close, clear, liveId, fresh, refreshLive } = useInvestigation()
  const [filter, setFilter] = useState<string | null>(null)
  useEscape(open && !embedded, close)
  // Live: the opened event is re-checked every 30 s; what arrives pulses on the graph
  useEffect(() => {
    if (!liveId || (!open && !embedded)) return
    const t = setInterval(() => void refreshLive(), 30_000)
    return () => clearInterval(t)
  }, [liveId, open, embedded, refreshLive])
  const nodes = useMemo(() => Object.values(entities), [entities])
  const es = useMemo(() => Object.values(edges).filter((e) => entities[e.from] && entities[e.to]), [edges, entities])
  const pos = useMemo(() => {
    const next = relayout(placed, nodes, es)
    placed.clear()
    for (const [k, v] of next) placed.set(k, v)
    return next
  }, [nodes, es])
  if (!open && !embedded) return null
  const shown = (n: Entity) => !filter || n.type === filter
  const hotCount = selected ? es.filter((e) => e.from === selected || e.to === selected).length : 0
  return (
    <section className={`investigation ${embedded ? 'embedded' : ''}`} aria-label="Investigation canvas">
      <header>
        <b>Investigation</b>
        <span>
          {nodes.length} entities · {es.length} relations
        </span>
        {liveId && <span className="inv-live" title="The opened event is re-checked every 30 s; new nodes pulse">● live</span>}
        <span className="inv-rings" title="Event rings: green confirmed, yellow single source, orange government only, pink contested, red debunked. Source rings: orange state-run, blue public, green independent.">
          rings = check / ownership
        </span>
        <div className="inv-legend">
          {Object.entries(TYPE).map(([k, t]) => (
            <button key={k} className={filter === k ? 'on' : ''} style={{ color: t.color }} onClick={() => setFilter(filter === k ? null : k)} title={`Highlight ${t.label}s`}>
              {t.glyph} {t.label}
            </button>
          ))}
        </div>
        {busy && <em>{busy}</em>}
        {error && <em className="err">{error}</em>}
        {!busy && !error && status && <em className="ok">▸ {status}</em>}
        <button onClick={clear}>clear</button>
        {!embedded && (
          <button onClick={close} aria-label="Close investigation">
            ×
          </button>
        )}
      </header>
      <div className="inv-body">
        <svg viewBox={`0 0 ${W} ${H}`} onClick={() => void select(null)}>
          {es.map((e) => {
            const a = pos.get(e.from)
            const b = pos.get(e.to)
            if (!a || !b) return null
            const hot = selected === e.from || selected === e.to
            // Label relations only when it stays readable: roles always, other relations for small fan-outs.
            const label = hot && (e.role ? e.role !== 'participant' : hotCount <= 10)
            return (
              <g key={e.id} className={`inv-edge ${hot ? 'hot' : ''} ${e.via === 'llm' ? 'llm' : ''}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {label && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3}>
                    {e.role ? `${e.role}` : REL[e.rel]}
                  </text>
                )}
              </g>
            )
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id)
            if (!p) return null
            const t = TYPE[n.type]
            // Rings: events by check status, sources by who owns them (state / public / independent)
            const ring = n.check ? CHECK_COLOR[n.check.status] : n.type === 'source' && OWN_COLOR[String(n.props.ownership)] ? OWN_COLOR[String(n.props.ownership)] : t.color
            return (
              <g
                key={n.id}
                className={`inv-node ${selected === n.id ? 'sel' : ''} ${shown(n) ? '' : 'dim'} ${fresh[n.id] ? 'fresh' : ''}`}
                transform={`translate(${p.x},${p.y})`}
                onClick={(ev) => {
                  ev.stopPropagation()
                  void select(n.id)
                }}
              >
                <circle r={n.type === 'event' ? 16 : 12} style={{ stroke: ring, fill: `color-mix(in srgb, ${t.color} 22%, #0b1220)` }} />
                <text className="glyph" y={4} style={{ fill: t.color }}>
                  {t.glyph}
                </text>
                <text className="lbl" y={n.type === 'event' ? 30 : 26}>
                  {n.label.length > 34 ? n.label.slice(0, 32) + '…' : n.label}
                </text>
              </g>
            )
          })}
        </svg>
        <aside>
          <Inspector />
          {aside}
        </aside>
      </div>
    </section>
  )
}
