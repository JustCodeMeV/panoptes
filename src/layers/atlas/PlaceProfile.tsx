import { useEffect, useState } from 'react'
import { openCity, openCountry, openRegion, useAtlas } from '../../core/atlas'
import type { DetailProps } from '../../core/types'

type Place = {
  name: string
  title?: string
  description?: string
  extract?: string
  image?: string
  url?: string
  population?: { value: number; year?: string }
  areaKm2?: number
  capital?: string
  website?: string
  now?: { counts: Record<string, number>; top: { id: string; title: string; layerId: string; at: string }[] }
}

const LABEL: Record<string, string> = {
  events: 'checked events', acled: 'conflict events', unrest: 'unrest hotspots', news: 'stories', telegram: 'Telegram posts', warnings: 'warnings',
  humanitarian: 'humanitarian reports', hazards: 'hazards', osint: 'outages', cyber: 'cyber incidents', statements: 'statements', ships: 'ships', 'military-air': 'military aircraft',
}
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(Math.round(n)))

let places: Promise<{ cities: [string, number, number, number, 0 | 1][] }> | null = null
const loadPlaces = () => (places ??= fetch('/places.json').then((r) => r.json()))

/** A region (state, province, oblast) or a city: what it is, how many live there, what is happening there now. */
export function PlaceProfile({ feature, select }: DetailProps) {
  const p = feature.props as { kind: 'region' | 'city'; region?: string; city?: string; country?: string }
  const name = (p.kind === 'city' ? p.city : p.region) ?? feature.title
  const [d, setD] = useState<Place | null>(null)
  const [cities, setCities] = useState<[string, number, number][]>([])
  const regions = useAtlas((s) => s.regions)

  useEffect(() => {
    let alive = true
    const q = new URLSearchParams({ name, kind: p.kind, ...(p.country ? { country: p.country } : {}), ...(p.region && p.kind === 'city' ? { region: p.region } : {}) })
    if (p.kind === 'city' && feature.position) {
      q.set('lat', String(feature.position.lat))
      q.set('lon', String(feature.position.lon))
    }
    fetch(`/api/atlas/place?${q}`)
      .then((r) => r.json())
      .then((j) => alive && setD(j))
      .catch(() => alive && setD({ name }))
    return () => {
      alive = false
    }
  }, [name, p.kind, p.country, p.region, feature.position])

  // Largest cities of a region (Natural Earth ranks them by size)
  useEffect(() => {
    if (p.kind !== 'region' || !feature.geometry) return
    let alive = true
    void Promise.all([loadPlaces(), import('d3-geo')]).then(([pl, { geoContains }]: [{ cities: [string, number, number, number, 0 | 1][] }, typeof import('d3-geo')]) => {
      if (!alive) return
      const g = feature.geometry as Parameters<typeof geoContains>[0]
      setCities(pl.cities.filter(([, lon, lat]) => geoContains(g, [lon, lat])).slice(0, 12).map(([n, lon, lat]) => [n, lat, lon]))
    })
    return () => {
      alive = false
    }
  }, [p.kind, feature.geometry])

  const region = p.kind === 'city' && p.region && regions?.list.find((r) => r.name === p.region)
  const now = d?.now
  return (
    <div className="detail atlas">
      <nav className="atlas-crumbs" aria-label="Place">
        {p.country && <button className="atlas-link" onClick={() => void openCountry(p.country!)}>{p.country}</button>}
        {region && regions && (
          <>
            {' › '}
            <button className="atlas-link" onClick={() => void openRegion(regions.country, region)}>{region.name}</button>
          </>
        )}
        {' › '}
        <b>{name}</b>
      </nav>
      <header className="atlas-head">
        {d?.image && <img src={d.image} alt="" referrerPolicy="no-referrer" />}
        <div>
          <h2>{name}</h2>
          <span>{d ? (d.description ?? (p.kind === 'city' ? 'City' : 'Region')) : 'Loading…'}</span>
        </div>
      </header>
      {d && (
        <div className="atlas-cards">
          {d.population && (
            <div className="atlas-card">
              <small>Population</small>
              <b>{fmt(d.population.value)}</b>
              {d.population.year && <small>{d.population.year}</small>}
            </div>
          )}
          {d.areaKm2 !== undefined && (
            <div className="atlas-card">
              <small>Area</small>
              <b>{fmt(d.areaKm2)} km²</b>
            </div>
          )}
          {d.capital && (
            <div className="atlas-card">
              <small>{p.kind === 'region' ? 'Capital' : 'Capital of'}</small>
              <b>{d.capital}</b>
            </div>
          )}
        </div>
      )}
      {d?.extract && <p className="osum">{d.extract}</p>}
      {(d?.url || d?.website) && (
        <p className="t-caption">
          {d.url && <a href={d.url} target="_blank" rel="noreferrer">Wikipedia</a>}
          {d.url && d.website && ' · '}
          {d.website && <a href={d.website} target="_blank" rel="noreferrer">official site</a>}
        </p>
      )}
      <h3>Right now {p.kind === 'city' ? '(within 30 km)' : ''}</h3>
      {now && Object.keys(now.counts).length ? (
        <p className="atlas-now">{Object.entries(now.counts).map(([k, n]) => `${n} ${LABEL[k] ?? k}`).join(' · ')}</p>
      ) : (
        <p className="atlas-now">{now ? 'Nothing in the live layers here right now.' : '…'}</p>
      )}
      <ul className="evidence">
        {now?.top.map((x) => (
          <li key={x.id}>
            <button className="atlas-link" onClick={() => select(x.id)}>{x.title}</button>
          </li>
        ))}
      </ul>
      {cities.length > 0 && (
        <>
          <h3>Main cities</h3>
          <div className="flex flex-wrap gap-1.5">
            {cities.map(([n, lat, lon]) => (
              <button key={n} className="atlas-chip" onClick={() => void openCity(n, lat, lon)}>{n}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
