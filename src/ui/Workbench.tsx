import { useEffect, useMemo, useRef, useState } from 'react'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { feature as topoFeature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json'
import type { Edge, Entity } from '../../shared/entities'
import type { Feature } from '../../shared/feature'
import { useCases, type CaseFull } from '../core/cases'
import { flyTo, useInvestigation } from '../core/investigation'
import { downloadCasePdf } from './casePdf'
import { graphPositions, restorePositions } from './graphPositions'
import { Investigation } from './Investigation'
import { setCaseMode } from './shell'

/**
 * CASE WORKBENCH (case mode): the case file, the investigation graph and the
 * analyst's reasoning in one full-screen view. Left: case, evidence (tagged),
 * notes and hypotheses. Centre: the graph with its inspector and a mini map.
 * Bottom: the timeline of evidence and events.
 *
 * Saved to the server (SQLite) and mirrored in this browser: the free host's disk
 * is wiped whenever it sleeps or redeploys, so a case missing on the server is
 * re-created from the browser's copy.
 */

type Tag = 'supports' | 'refutes' | 'context'
type Hypothesis = { id: string; text: string; confidence: 'low' | 'medium' | 'high' }
type Workspace = {
  status: 'open' | 'monitoring' | 'closed'
  notes: string
  hypotheses: Hypothesis[]
  tags: Record<string, Tag>
  graph?: { entities: Record<string, Entity>; edges: Record<string, Edge>; positions: Record<string, { x: number; y: number }> }
}
const EMPTY: Workspace = { status: 'open', notes: '', hypotheses: [], tags: {} }
const MIRROR = 'argus.case.'
const TAG_COLOR: Record<Tag, string> = { supports: '#22c55e', refutes: '#ef4444', context: '#94a3b8' }

const mirror = (c: CaseFull, ws: Workspace) => {
  try {
    localStorage.setItem(MIRROR + c.id, JSON.stringify({ title: c.title, items: c.items.map((i) => ({ feature: i.feature, note: i.note })), workspace: ws, savedAt: Date.now() }))
  } catch {
    /* storage full or blocked: the server copy still exists */
  }
}
const readMirror = (id: number): { title: string; items: { feature: Feature; note: string }[]; workspace: Workspace } | null => {
  try {
    return JSON.parse(localStorage.getItem(MIRROR + id) ?? 'null')
  } catch {
    return null
  }
}

/** Cases saved in this browser that the server lost (restart): re-created there. */
async function restoreLostCases(serverIds: number[]): Promise<boolean> {
  let restored = false
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(MIRROR)) continue
    const id = Number(key.slice(MIRROR.length))
    if (serverIds.includes(id)) continue
    const m = readMirror(id)
    if (!m) continue
    const r = await fetch('/api/cases/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }).catch(() => null)
    if (r?.ok) {
      const { id: newId } = (await r.json()) as { id: number }
      localStorage.removeItem(key)
      localStorage.setItem(MIRROR + newId, JSON.stringify(m))
      restored = true
    }
  }
  return restored
}

// ---------- mini map ----------
const topo = countries110 as unknown as Topology<{ countries: GeometryCollection }>
const LAND = topoFeature(topo, topo.objects.countries)
const PROJ = geoEqualEarth().fitSize([280, 150], LAND)
const LAND_PATH = geoPath(PROJ)(LAND) ?? ''

function MiniMap({ entities, selected, onPick, onGlobe }: { entities: Entity[]; selected: string | null; onPick: (e: Entity) => void; onGlobe: (e: Entity) => void }) {
  const sel = entities.find((e) => e.id === selected && e.position)
  return (
    <div className="wb-map">
      <span className="wb-h">Map</span>
      <svg viewBox="0 0 280 150" role="img" aria-label="Where the case's entities are">
        <path d={LAND_PATH} className="land" />
        {entities
          .filter((e) => e.position)
          .map((e) => {
            const xy = PROJ([e.position!.lon, e.position!.lat])
            return xy ? <circle key={e.id} cx={xy[0]} cy={xy[1]} r={selected === e.id ? 4 : 2.5} className={selected === e.id ? 'sel' : ''} onClick={() => onPick(e)}><title>{e.label}</title></circle> : null
          })}
      </svg>
      {sel ? (
        <button type="button" className="wb-globe" onClick={() => onGlobe(sel)}>
          Show {sel.label.length > 30 ? `${sel.label.slice(0, 28)}…` : sel.label} on the globe
        </button>
      ) : (
        <small>Click a dot to select it on the graph.</small>
      )}
    </div>
  )
}

// ---------- timeline ----------
function Timeline({ items, events, selected, until, onUntil, onItem, onEvent }: { items: { id: number; at: number; title: string; tag?: Tag }[]; events: Entity[]; selected: string | null; until: number | null; onUntil: (t: number | null) => void; onItem: (id: number) => void; onEvent: (id: string) => void }) {
  const pts = [...items.map((i) => i.at), ...events.map((e) => e.firstSeen)].filter(Number.isFinite)
  if (!pts.length) return <div className="wb-timeline empty">The timeline fills as you add evidence and grow the graph.</div>
  const lo = Math.min(...pts)
  const hi = Math.max(...pts, lo + 3600_000)
  const x = (t: number) => 20 + ((t - lo) / (hi - lo)) * 960
  const day = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="wb-timeline">
      <svg viewBox="0 0 1000 64" preserveAspectRatio="none">
        <line x1="20" x2="980" y1="40" y2="40" className="axis" />
        {until !== null && <rect x={x(until)} y={0} width={980 - x(until)} height={64} className="later" />}
        {events.map((e) => (
          <circle key={e.id} cx={x(e.firstSeen)} cy={40} r={selected === e.id ? 6 : 3.5} className={`ev ${selected === e.id ? 'sel' : ''}`} onClick={() => onEvent(e.id)}>
            <title>{`${day(e.firstSeen)} · ${e.label}`}</title>
          </circle>
        ))}
        {items.map((i) => (
          <rect key={i.id} x={x(i.at) - 4} y={14} width={8} height={14} style={{ fill: i.tag ? TAG_COLOR[i.tag] : 'var(--color-accent-2)' }} onClick={() => onItem(i.id)}>
            <title>{`${day(i.at)} · evidence: ${i.title}`}</title>
          </rect>
        ))}
      </svg>
      <input
        type="range"
        min={lo}
        max={hi}
        step={60_000}
        value={until ?? hi}
        aria-label="Replay the graph up to this moment"
        onChange={(e) => {
          const v = Number(e.target.value)
          onUntil(v >= hi - 60_000 ? null : v)
        }}
      />
      <div className="wb-axis">
        <span>{day(lo)}</span>
        <span>{until === null ? '▮ evidence · ● events in the graph · drag to replay the graph' : `graph as of ${day(until)}`}</span>
        <span>{day(hi)}</span>
      </div>
    </div>
  )
}

export function Workbench() {
  const { cases, activeId, open, refresh, create, setActive, setNote, remove } = useCases()
  const inv = useInvestigation()
  const [ws, setWs] = useState<Workspace>(EMPTY)
  const [loadedFor, setLoadedFor] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [hyp, setHyp] = useState('')
  const [saved, setSaved] = useState<string>('')
  const [pdfBusy, setPdfBusy] = useState(false)

  // On entry: bring back cases the server lost, then load the list
  useEffect(() => {
    void (async () => {
      await refresh()
      if (await restoreLostCases(useCases.getState().cases.map((c) => c.id))) await refresh()
    })()
  }, [refresh])

  // Open a case: its workspace from the server, else from this browser
  useEffect(() => {
    if (!open || loadedFor === open.id) return
    let alive = true
    void fetch(`/api/cases/${open.id}/workspace`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((server: Partial<Workspace>) => {
        if (!alive) return
        const w = { ...EMPTY, ...(server.status ? server : (readMirror(open.id)?.workspace ?? {})) } as Workspace
        setWs(w)
        if (w.graph) {
          restorePositions(w.graph.positions ?? {})
          inv.load(w.graph)
        } else inv.clear()
        setLoadedFor(open.id)
        // Opened from the Brief: seed the event once this case's (empty) graph is in place
        const pending = useInvestigation.getState().pending
        if (pending) {
          useInvestigation.setState({ pending: null })
          void useInvestigation.getState().seedEntity(pending)
        }
      })
    return () => {
      alive = false
    }
  }, [open, loadedFor, inv])

  // Autosave (debounced): workspace + graph, to the server and this browser
  const graphKey = `${Object.keys(inv.entities).length}:${Object.keys(inv.edges).length}`
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!open || loadedFor !== open.id) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const st = useInvestigation.getState()
      const keep = Object.values(st.entities).slice(0, 200)
      const ids = new Set(keep.map((e) => e.id))
      const full: Workspace = {
        ...ws,
        graph: { entities: Object.fromEntries(keep.map((e) => [e.id, e])), edges: Object.fromEntries(Object.entries(st.edges).filter(([, e]) => ids.has(e.from) && ids.has(e.to))), positions: graphPositions() },
      }
      mirror(open, full)
      void fetch(`/api/cases/${open.id}/workspace`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(full) })
        .then((r) => setSaved(r.ok ? `saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'saved in this browser only'))
        .catch(() => setSaved('saved in this browser only'))
    }, 1200)
    return () => clearTimeout(timer.current)
  }, [ws, graphKey, open, loadedFor])

  const entities = useMemo(() => Object.values(inv.entities), [inv.entities])
  const events = useMemo(() => entities.filter((e) => e.type === 'event'), [entities])
  const items = open?.items ?? []
  const patch = (p: Partial<Workspace>) => setWs((w) => ({ ...w, ...p }))

  const [until, setUntil] = useState<number | null>(null)
  const pickOnGlobe = (e: Entity) => {
    setCaseMode(false)
    if (e.position) setTimeout(() => flyTo(e.position!.lat, e.position!.lon), 300)
  }

  return (
    <div className="workbench" role="main" aria-label="Case workbench">
      <aside className="wb-left">
        <div className="wb-top">
          <button className="wb-back" onClick={() => setCaseMode(false)}>← Map</button>
          <span className="wb-h">Case mode</span>
          <em>{saved}</em>
        </div>
        <label className="wb-field">
          <span>Case</span>
          <select value={activeId ?? ''} onChange={(e) => void setActive(Number(e.target.value) || null).then(() => setLoadedFor(null))}>
            {cases.length === 0 && <option value="">(no case yet)</option>}
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.items})
              </option>
            ))}
          </select>
        </label>
        <form
          className="wb-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) void create(title.trim()).then(() => setLoadedFor(null))
            setTitle('')
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New case title…" aria-label="New case title" />
          <button type="submit">Create</button>
        </form>
        {open && (
          <>
            <div className="wb-row">
              <span className="wb-h">Status</span>
              {(['open', 'monitoring', 'closed'] as const).map((s) => (
                <button key={s} className={ws.status === s ? 'on' : ''} onClick={() => patch({ status: s })}>
                  {s}
                </button>
              ))}
              <button
                className="wb-pdf"
                disabled={pdfBusy}
                onClick={() => {
                  setPdfBusy(true)
                  void downloadCasePdf(open).finally(() => setPdfBusy(false))
                }}
              >
                PDF
              </button>
            </div>

            <span className="wb-h">Evidence ({items.length})</span>
            <ul className="wb-evidence">
              {items.length === 0 && <li className="wb-empty">Use “Add to case” on any item on the globe, then come back here.</li>}
              {items.map((i) => {
                const tag = ws.tags[i.id]
                return (
                  <li key={i.id} style={{ borderLeftColor: tag ? TAG_COLOR[tag] : undefined }}>
                    <b>{i.feature.title}</b>
                    <small>
                      {i.feature.layerId} · {new Date(i.feature.observedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </small>
                    <div className="wb-row">
                      {(['supports', 'refutes', 'context'] as const).map((t) => (
                        <button key={t} className={tag === t ? 'on' : ''} style={{ ['--c' as string]: TAG_COLOR[t] }} onClick={() => patch({ tags: { ...ws.tags, [i.id]: t } })}>
                          {t}
                        </button>
                      ))}
                      <button onClick={() => void inv.seedFeature(i.feature)} title="Open it as entities on the graph">
                        ◆ graph
                      </button>
                      <button onClick={() => void remove(i.id)} aria-label="Remove from case">
                        ×
                      </button>
                    </div>
                    <textarea defaultValue={i.note} placeholder="Note…" aria-label="Note on this evidence" onBlur={(e) => void setNote(i.id, e.target.value)} />
                  </li>
                )
              })}
            </ul>

            <span className="wb-h">Hypotheses</span>
            <ul className="wb-hyps">
              {ws.hypotheses.map((h) => {
                const sup = items.filter((i) => ws.tags[i.id] === 'supports').length
                const ref = items.filter((i) => ws.tags[i.id] === 'refutes').length
                return (
                  <li key={h.id}>
                    <span>{h.text}</span>
                    <select value={h.confidence} aria-label="Confidence" onChange={(e) => patch({ hypotheses: ws.hypotheses.map((x) => (x.id === h.id ? { ...x, confidence: e.target.value as Hypothesis['confidence'] } : x)) })}>
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                    <small>
                      {sup} for · {ref} against
                    </small>
                    <button aria-label="Remove hypothesis" onClick={() => patch({ hypotheses: ws.hypotheses.filter((x) => x.id !== h.id) })}>
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
            <form
              className="wb-row"
              onSubmit={(e) => {
                e.preventDefault()
                if (hyp.trim()) patch({ hypotheses: [...ws.hypotheses, { id: String(Date.now()), text: hyp.trim(), confidence: 'low' }] })
                setHyp('')
              }}
            >
              <input value={hyp} onChange={(e) => setHyp(e.target.value)} placeholder="Add a hypothesis…" aria-label="New hypothesis" />
              <button type="submit">Add</button>
            </form>

            <span className="wb-h">Notes</span>
            <textarea className="wb-notes" value={ws.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="What you know, what you don't, what to check next…" aria-label="Case notes" />
          </>
        )}
      </aside>

      <div className="wb-centre">
        <Investigation embedded until={until} aside={<MiniMap entities={entities} selected={inv.selected} onPick={(e) => void inv.select(e.id)} onGlobe={pickOnGlobe} />} />
      </div>

      <footer className="wb-bottom">
        <Timeline
          items={items.map((i) => ({ id: i.id, at: Date.parse(i.feature.observedAt), title: i.feature.title, tag: ws.tags[i.id] }))}
          events={events}
          selected={inv.selected}
          until={until}
          onUntil={setUntil}
          onItem={(id) => {
            const it = items.find((x) => x.id === id)
            if (it) void inv.seedFeature(it.feature)
          }}
          onEvent={(id) => void inv.select(id)}
        />
      </footer>
    </div>
  )
}
