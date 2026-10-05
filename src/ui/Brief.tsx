import { useEffect, useState } from 'react'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { feature as topoFeature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json'
import { flyTo, useInvestigation } from '../core/investigation'
import { useStore } from '../core/store'
import { useCases } from '../core/cases'
import { setMode } from './shell'

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

/** What the check status means, in plain words. */
const STATUS: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed: independent outlets in several countries', color: '#22c55e' },
  corroborated: { label: 'Corroborated by independent outlets', color: '#84cc16' },
  'single-source': { label: 'Single source so far', color: '#eab308' },
  'government-only': { label: 'Only government outlets so far', color: '#f97316' },
  contested: { label: 'Contested: sources disagree', color: '#e879f9' },
  debunked: { label: 'Debunked by a fact-check', color: '#ef4444' },
}

const topo = countries110 as unknown as Topology<{ countries: GeometryCollection }>
const LAND = topoFeature(topo, topo.objects.countries)
const PROJ = geoEqualEarth().fitSize([160, 84], LAND)
const LAND_PATH = geoPath(PROJ)(LAND) ?? ''

function Locator({ at }: { at?: { lat: number; lon: number } }) {
  const xy = at && PROJ([at.lon, at.lat])
  return (
    <svg viewBox="0 0 160 84" className="brief-map" aria-hidden>
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
    setTimeout(() => {
      if (i.position) flyTo(i.position.lat, i.position.lon)
      select(`events:${i.id}`)
    }, 300)
  }
  // A new case named after the event; the workbench seeds the graph once it has opened it
  const investigate = async (i: Item) => {
    useInvestigation.setState({ pending: i.id })
    await useCases.getState().create(i.title.slice(0, 100)).catch(() => {})
    setMode('investigate')
  }

  return (
    <main className="brief" aria-label="What needs attention now">
      <header>
        <h1>What needs attention now</h1>
        <p>
          ARGUS reads news, Telegram, official statements and physical signals from every region, groups them into events, checks who reports
          them, and ranks what is developing. Open one on the map, or investigate it: the graph is already built.
        </p>
      </header>
      {err && <p className="brief-note">Briefing unavailable ({err}). The map still works.</p>}
      {!items && !err && <p className="brief-note">Reading the world…</p>}
      {items?.length === 0 && <p className="brief-note">Nothing checked yet: the first pass takes about a minute after start.</p>}
      <ol className="brief-list">
        {items?.map((i, n) => {
          const st = STATUS[i.status] ?? { label: i.status, color: '#94a3b8' }
          return (
            <li key={i.id} className="brief-card">
              <span className="brief-rank">{n + 1}</span>
              <Locator at={i.position} />
              <div className="brief-body">
                <small>
                  {i.kind.replace('-', ' ')} · {i.place ?? 'place unknown'}
                  {i.country && i.country !== i.place ? `, ${i.country}` : ''} · updated {ago(i.lastSeen)}
                </small>
                <h2>{i.title}</h2>
                <p className="brief-status" style={{ ['--c' as string]: st.color }}>
                  <b>{st.label}</b> · {i.reasons[0]}
                </p>
                <ul>
                  {i.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <div className="brief-actions">
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
