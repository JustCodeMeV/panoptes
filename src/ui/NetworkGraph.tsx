import { useEffect, useMemo, useState } from 'react'
import type { Feature } from '../../shared/feature'
import { buildNetwork, type NetEdge, type NetGraph, type NetNode } from '../../shared/network'
import { CLS } from '../layers/campaigns/classes'

type P = { x: number; y: number }

/** Small deterministic force layout (no dependency): repulsion + weighted springs + gravity. */
function layout(nodes: NetNode[], edges: NetEdge[], w: number, h: number): Map<string, P> {
  const pos = new Map<string, P>()
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2
    pos.set(n.id, { x: w / 2 + Math.cos(a) * w * 0.35, y: h / 2 + Math.sin(a) * h * 0.35 })
  })
  const k = Math.sqrt((w * h) / Math.max(1, nodes.length)) * 0.8
  const list = nodes.map((n) => pos.get(n.id)!)
  for (let it = 0; it < 260; it++) {
    const t = 0.1 * (1 - it / 260) + 0.01
    const d = list.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const dx = list[i].x - list[j].x || 0.01
        const dy = list[i].y - list[j].y || 0.01
        const dist2 = dx * dx + dy * dy
        const f = (k * k) / dist2
        d[i].x += dx * f * 0.05
        d[i].y += dy * f * 0.05
        d[j].x -= dx * f * 0.05
        d[j].y -= dy * f * 0.05
      }
    const idx = new Map(nodes.map((n, i) => [n.id, i]))
    for (const e of edges) {
      const i = idx.get(e.from)
      const j = idx.get(e.to)
      if (i === undefined || j === undefined) continue
      const dx = list[j].x - list[i].x
      const dy = list[j].y - list[i].y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const f = ((dist - k) / dist) * Math.min(1, 0.15 + e.weight * 0.05)
      d[i].x += dx * f * 0.5
      d[i].y += dy * f * 0.5
      d[j].x -= dx * f * 0.5
      d[j].y -= dy * f * 0.5
    }
    list.forEach((p, i) => {
      d[i].x += (w / 2 - p.x) * 0.03
      d[i].y += (h / 2 - p.y) * 0.03
      const m = Math.sqrt(d[i].x ** 2 + d[i].y ** 2) || 1
      const step = Math.min(m, k * t * 4)
      p.x = Math.min(w - 16, Math.max(16, p.x + (d[i].x / m) * step))
      p.y = Math.min(h - 16, Math.max(16, p.y + (d[i].y / m) * step))
    })
  }
  return pos
}

const short = (id: string) => id.replace(/^(tg|bsky):/, '@').replace(/^www\./, '').slice(0, 22)
const nodeColor = (n: NetNode) => CLS[n.cls]?.color ?? '#64748b'

export function NetworkGraph({ g, height = 300, onStory, focus }: { g: NetGraph; height?: number; onStory?(id: string): void; focus?: string }) {
  const W = 440
  const H = height
  const pos = useMemo(() => layout(g.nodes, g.edges, W, H), [g, H])
  const [sel, setSel] = useState<string | null>(null)
  const maxW = Math.max(1, ...g.edges.map((e) => e.weight))
  const r = (n: NetNode) => 4 + Math.min(10, Math.sqrt(n.stories) * 2)
  const touching = sel ? g.edges.filter((e) => e.from === sel || e.to === sel) : []
  const titles = new Map(g.stories.map((s) => [s.id, s.title]))

  if (!g.nodes.length) return <p className="empty">No co-amplification yet: sources need to share stories first.</p>
  return (
    <div className="net">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Co-amplification network">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
          </marker>
          <marker id="arr-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#ef4444" />
          </marker>
        </defs>
        {g.edges.map((e) => {
          const a = pos.get(e.from)
          const b = pos.get(e.to)
          if (!a || !b) return null
          const dim = sel && e.from !== sel && e.to !== sel
          const n = g.nodes.find((x) => x.id === e.to)
          const rr = n ? r(n) + 2 : 8
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          return (
            <line
              key={`${e.from}>${e.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x - (dx / len) * rr}
              y2={b.y - (dy / len) * rr}
              stroke={e.recurring ? '#ef4444' : '#94a3b8'}
              strokeOpacity={dim ? 0.08 : e.recurring ? 0.9 : 0.35}
              strokeWidth={0.6 + (e.weight / maxW) * 3}
              markerEnd={`url(#${e.recurring ? 'arr-hot' : 'arr'})`}
            >
              <title>{`${e.from} → ${e.to}: ${e.weight} shared stories, first on ${e.led}, median lead ${e.medianLeadMin} min${e.recurring ? ' · RECURRING on flagged stories' : ''}`}</title>
            </line>
          )
        })}
        {g.nodes.map((n) => {
          const p = pos.get(n.id)!
          const on = sel === n.id || focus === n.id
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} onClick={() => setSel(sel === n.id ? null : n.id)} style={{ cursor: 'pointer' }} opacity={sel && !on && !touching.some((e) => e.from === n.id || e.to === n.id) ? 0.25 : 1}>
              <circle r={r(n)} fill={nodeColor(n)} stroke={on ? '#fff' : n.flagged ? '#ef4444' : 'none'} strokeWidth={on ? 2 : 1.2} />
              {(g.nodes.length <= 30 || n.stories >= 3 || on) && (
                <text y={-r(n) - 3} textAnchor="middle">
                  {short(n.id)}
                </text>
              )}
              <title>{`${n.id} · ${n.cls}${n.bloc ? ` (${n.bloc})` : ''} · ${n.stories} stories, ${n.flagged} flagged`}</title>
            </g>
          )
        })}
      </svg>
      <div className="axis-legend">
        {Object.entries(CLS).map(([k, v]) => (
          <span key={k}>
            <i style={{ background: v.color }} /> {v.label}
          </span>
        ))}
        <span>
          <i style={{ background: '#ef4444' }} /> recurring pair
        </span>
        <em>arrow = usually first</em>
      </div>
      {sel && (
        <ul className="net-pairs">
          {touching.slice(0, 8).map((e) => {
            const other = e.from === sel ? e.to : e.from
            return (
              <li key={other}>
                <b className={e.recurring ? 'hot' : ''}>
                  {e.from === sel ? '→' : '←'} {short(other)}
                </b>{' '}
                <small>
                  {e.weight} shared · {e.from === sel ? 'leads' : 'follows'} by ~{e.medianLeadMin} min
                </small>
                {onStory &&
                  e.stories.slice(0, 3).map((s) => (
                    <button key={s} className="net-story" onClick={() => onStory(s)} title={titles.get(s)}>
                      {(titles.get(s) ?? s).slice(0, 60)}
                    </button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Fetches /api/network (global, or one story's sources with their pair history).
 * A story the server doesn't know (demo replay, checked claim) uses its baked
 * `props.network` or a graph built from its own timeline.
 */
export function NetworkView({ feature, all, height, onStory }: { feature?: Feature; all?: boolean; height?: number; onStory?(id: string): void }) {
  const baked = feature?.props.network as NetGraph | undefined
  const [g, setG] = useState<NetGraph | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const story = feature?.id
  useEffect(() => {
    if (baked) return
    const ac = new AbortController()
    const q = story ? `?story=${encodeURIComponent(story)}` : all ? '?all=1' : ''
    fetch(`/api/network${q}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: NetGraph) => (setG(d), setErr(null)))
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        if (feature) setG(buildNetwork([feature]))
        else setErr(e.message)
      })
    return () => ac.abort()
  }, [story, all, baked, feature])
  const graph = baked ?? g
  if (err) return <p className="empty">Network unavailable ({err}).</p>
  if (!graph) return <p className="empty">Building network…</p>
  return <NetworkGraph g={graph} height={height} onStory={onStory} />
}
