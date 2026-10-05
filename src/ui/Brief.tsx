import { useEffect, useState } from 'react'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { feature as topoFeature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json'
import { flyTo, useInvestigation } from '../core/investigation'
import { useStore } from '../core/store'
import { useCases } from '../core/cases'
import { STATUS } from '../core/status'
import { setMode } from './shell'
import { useGlobeUi } from '../globe/globeUi'

type Item = {
  id: string
  title: string
  kind: string
  place?: string
  country?: string
  position?: { lat: number; lon: number }
  status: string
  reasons: string[]
  why: string[]
  sources: number
  independent: number
  countries: number
  lastSeen: number
  featureId?: string
}


const topo = countries110 as unknown as Topology<{ countries: GeometryCollection }>
const LAND = topoFeature(topo, topo.objects.countries)
const PROJ = geoEqualEarth().fitSize([160, 84], LAND)
const LAND_PATH = geoPath(PROJ)(LAND) ?? ''

function Locator({ at }: { at?: { lat: number; lon: number } }) {
  const xy = at && PROJ([at.lon, at.lat])
  return (
    <svg viewBox="0 0 160 84" className="bv-map" aria-hidden>
      <path d={LAND_PATH} className="land" />
      {xy && <circle cx={xy[0]} cy={xy[1]} r={3.5} />}
    </svg>
  )
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 60 ? `${Math.max(1, m)} min ago` : `${Math.round(m / 60)} h ago`
}

/**
 * BRIEF (the first screen): what needs attention now, ranked and checked, each with the
 * reasons in plain words and two ways in, the map or the investigation graph.
 */
export function Brief() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const select = useStore((s) => s.select)
  const setEnabled = useStore((s) => s.setEnabled)

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/briefing?limit=8')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { items: Item[] }) => alive && (setItems(j.items), setErr(null)))
        .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)))
    void load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const onMap = (i: Item) => {
    useInvestigation.getState().close()
    setMode('map')
    setEnabled(['events'], true)
    select(`events:${i.id}`)
    if (!i.position) return
    const go = () => flyTo(i.position!.lat, i.position!.lon)
    // The globe pauses while hidden; on its first showing it plays its intro flight home first
    if (useGlobeUi.getState().ready) setTimeout(go, 400)
    else {
      const off = useGlobeUi.subscribe((st) => {
        if (!st.ready) return
        off()
        setTimeout(go, 3000)
      })
    }
  }
  // A new case named after the event; the workbench seeds the graph once it has opened it
  const investigate = async (i: Item) => {
    useInvestigation.setState({ pending: i.id })
    await useCases.getState().create(i.title.slice(0, 100)).catch(() => {})
    setMode('investigate')
  }

  return (
    <main className="bv" aria-label="What needs attention now">
      <header>
        <h1>What needs attention now</h1>
        <p>
          ARGUS reads news, Telegram, official statements and physical signals from every region, groups them into events, checks who reports
          them, and ranks what is developing. Open one on the map, or investigate it: the graph is already built.
        </p>
      </header>
      {err && <p className="bv-note">Briefing unavailable ({err}). The map still works.</p>}
      {!items && !err && <p className="bv-note">Reading the world…</p>}
      {items?.length === 0 && <p className="bv-note">Nothing checked yet: the first pass takes about a minute after start.</p>}
      <ol className="bv-list">
        {items?.map((i, n) => {
          const st = STATUS[i.status] ?? { label: i.status, color: '#94a3b8' }
          return (
            <li key={i.id} className="bv-card">
              <span className="bv-rank">{n + 1}</span>
              <Locator at={i.position} />
              <div className="bv-body">
                <small>
                  {i.kind.replace('-', ' ')} · {i.place ?? 'place unknown'}
                  {i.country && i.country !== i.place ? `, ${i.country}` : ''} · updated {ago(i.lastSeen)}
                </small>
                <h2>{i.title}</h2>
                <p className="bv-status" style={{ ['--c' as string]: st.color }}>
                  <b>{st.label}</b> · {i.reasons[0]}
                </p>
                <ul>
                  {i.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <div className="bv-actions">
                  <button type="button" onClick={() => onMap(i)}>Show on map</button>
                  <button type="button" className="primary" onClick={() => void investigate(i)}>Investigate</button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
