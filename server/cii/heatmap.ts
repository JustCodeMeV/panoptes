import { cellToBoundary, cellToLatLng, gridDisk, latLngToCell } from 'h3-js'
import type { Feature } from '../../shared/feature.ts'
import { loadLayer } from '../core/aggregate.ts'
import { streamSource } from '../core/hub.ts'
import type { Provider } from '../core/provider.ts'
import { COUNTRIES, displayName } from '../atlas/countries.ts'
import { centroidOf, countryAt } from '../geo/gazetteer.ts'

/**
 * INSTABILITY HEATMAP: where it is unstable, not which country. Instability is
 * local (the Russian border regions, not Siberia; Kashmir, not all of India), so
 * every located signal is dropped into an H3 grid (resolution 4, ~1,800 km², the
 * same grid GPSJam uses) and spread a little to the neighbouring cells.
 *
 * Signals come in independent FAMILIES. One family alone can be noise (a busy news
 * town, a jammer near an airport); several families agreeing in the same place is
 * the strong signal: strikes + GPS jamming + military aircraft + a front line is a
 * war zone, protests + an internet outage is a crackdown. Each extra family in a
 * cell multiplies its score. Every cell keeps the reasons it is hot.
 */

const RES = 4
const HALF_LIFE_H = 24
const EVERY_MS = 5 * 60_000
const NEIGHBOUR_SHARE = 0.35
const MIN_SCORE = 12
const MAX_CELLS = 1500

type Family = 'conflict' | 'unrest' | 'military' | 'jamming' | 'frontline' | 'warnings' | 'chatter' | 'outage'
export const FAMILY_LABEL: Record<Family, string> = {
  conflict: 'fighting and strikes',
  unrest: 'protests and arrests',
  military: 'military aircraft',
  jamming: 'GPS jamming',
  frontline: 'front line',
  warnings: 'military and maritime warnings',
  chatter: 'conflict chatter on Telegram',
  outage: 'internet outage or censorship',
}

// Reports (news, Telegram, GDELT) all come from text: one class of evidence, however many families they
// fill. The physical signals are each their own class. Only independent classes earn the agreement bonus.
const CLASS: Record<Family, string> = { conflict: 'reports', unrest: 'reports', chatter: 'reports', frontline: 'frontline', jamming: 'jamming', military: 'military', warnings: 'warnings', outage: 'outage' }

// Capitals: stories ABOUT a country are often placed at its capital (and GDELT codes country-level events
// there). Text-derived signals sitting on a capital count for less, so Moscow is not a war zone by default.
const CAPITALS = Object.values(COUNTRIES)
  .map((c) => (c.capital ? centroidOf(c.capital.replace(/\s*\(.*$/, '')) : undefined))
  .filter((p): p is { lat: number; lon: number } => !!p)
const nearCapital = (lat: number, lon: number) =>
  CAPITALS.some((c) => Math.abs(c.lat - lat) < 0.25 && Math.abs(c.lon - lon) < 0.35 / Math.max(0.2, Math.cos((lat * Math.PI) / 180)))

type Cell = { points: Partial<Record<Family, number>>; items: { id: string; title: string; w: number }[] }

let layers: Record<string, Provider[]> = {}
let features: Feature[] = []
let builtAt = 0

async function layer(id: string): Promise<Feature[]> {
  const live = streamSource(id)
  if (live) return live.snapshot().features
  const p = layers[id]
  return p ? (await loadLayer(id, p)).features : []
}

const VIOLENT = new Set(['strike', 'drone-attack', 'shelling', 'clash', 'explosion', 'missile-test'])
const CIVIL = new Set(['protest', 'arrest'])
const SECURITY_RE = /\b(strike|attack|drone|missile|shell|explosion|clash|killed|troops|artillery)|бпла|ракет|удар|обстр|вибух|غارة|قصف|انفجار/i

// Country centre points (the gazetteer's): an item placed exactly there was only located to its country
const CENTRES = Object.values(COUNTRIES)
  .map((c) => centroidOf(c.name) ?? centroidOf(displayName(c.name)))
  .filter((p): p is { lat: number; lon: number } => !!p)
const onCentre = (lat: number, lon: number) => CENTRES.some((c) => Math.abs(c.lat - lat) < 0.05 && Math.abs(c.lon - lon) < 0.05)

/** Positions that say nothing about a place inside a country (country centres, "country level") are left out. */
const located = (f: Feature) =>
  !!f.position && f.geoPrecision !== 'approximate' && f.geoPrecision !== 'none' && !/country level/i.test(f.geoBasis ?? '') && !onCentre(f.position.lat, f.position.lon)
const decay = (f: Feature, now: number) => {
  const age = (now - (Date.parse(f.observedAt) || now)) / 3_600_000
  return Math.pow(0.5, Math.max(0, age) / HALF_LIFE_H)
}

export async function computeHeatmap(now = Date.now()): Promise<Feature[]> {
  const [events, acled, unrest, telegram, warnings, air, gnss, fronts, osint] = await Promise.all(
    ['events', 'acled', 'unrest', 'telegram', 'warnings', 'military-air', 'gnss', 'frontlines', 'osint'].map((id) => layer(id).catch(() => [] as Feature[])),
  )
  const cells = new Map<string, Cell>()
  const add = (lat: number, lon: number, fam: Family, w: number, item?: { id: string; title: string }) => {
    if (!(w > 0) || !Number.isFinite(lat) || !Number.isFinite(lon)) return
    const hex = latLngToCell(lat, lon, RES)
    for (const h of gridDisk(hex, 1)) {
      const share = h === hex ? 1 : NEIGHBOUR_SHARE
      const c = cells.get(h) ?? { points: {}, items: [] }
      c.points[fam] = (c.points[fam] ?? 0) + w * share
      if (item && h === hex) c.items.push({ ...item, w })
      cells.set(h, c)
    }
  }
  const at = (f: Feature) => ({ id: f.id, title: f.title })
  /** Weight of a text-derived position: exact coordinates count fully, places read from text less, capitals far less. */
  const textWeight = (f: Feature) => (f.geoPrecision === 'exact' ? 1 : 0.7) * (nearCapital(f.position!.lat, f.position!.lon) ? 0.3 : 1)

  // Checked events: the strongest single signal (resolved from many reports, with casualties)
  for (const f of events) {
    if (!located(f)) continue
    const kind = String(f.props.kind)
    const sources = Number(f.props.sources) || 1
    const w = (1 + Math.log2(sources)) * decay(f, now) * (1 + Math.min(2, Math.log2(1 + (Number(f.props.casualties) || 0)) / 3)) * textWeight(f)
    if (VIOLENT.has(kind)) add(f.position!.lat, f.position!.lon, 'conflict', 3 * w, at(f))
    else if (CIVIL.has(kind)) add(f.position!.lat, f.position!.lon, 'unrest', 1.5 * w, at(f))
  }
  for (const f of acled) if (located(f)) add(f.position!.lat, f.position!.lon, 'conflict', (2 + (Number(f.props.fatalities) || 0) / 3) * decay(f, now) * textWeight(f), at(f))
  for (const f of unrest) {
    if (!located(f)) continue
    const fam: Family = f.props.dominant === 'protest' ? 'unrest' : 'conflict'
    add(f.position!.lat, f.position!.lon, fam, Math.min(4, 1 + Math.log2(1 + (Number(f.props.sources) || 1))) * decay(f, now) * textWeight(f), at(f))
  }
  for (const f of telegram) if (located(f) && SECURITY_RE.test(`${f.title} ${String(f.props.text ?? '')}`)) add(f.position!.lat, f.position!.lon, 'chatter', 0.6 * decay(f, now) * textWeight(f), at(f))
  for (const f of warnings) if (f.position && f.props.military) add(f.position.lat, f.position.lon, 'warnings', 2 * decay(f, now), at(f))
  for (const f of air) if (f.position) add(f.position.lat, f.position.lon, 'military', 0.5)
  // GPS jamming: already on this grid; share of affected aircraft is the weight
  for (const f of gnss) if (f.position) add(f.position.lat, f.position.lon, 'jamming', 4 * (Number(f.props.share) || 0))
  // Front lines: the edge of occupied and contested areas, sampled along the outline
  for (const f of fronts) {
    if (f.props.kind !== 'frontline' || !f.geometry) continue
    const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : []
    const seen = new Set<string>()
    for (const ring of rings as number[][][])
      for (let i = 0; i < ring.length; i += 3) {
        const [lon, lat] = ring[i]
        const hex = latLngToCell(lat, lon, RES)
        if (seen.has(hex)) continue
        seen.add(hex)
        add(lat, lon, 'frontline', 2)
      }
  }
  for (const f of osint) {
    if (!located(f)) continue
    if (/outage|censorship|block|shutdown/i.test(String(f.props.category ?? ''))) add(f.position!.lat, f.position!.lon, 'outage', 1.5 * decay(f, now), at(f))
  }

  const out: Feature[] = []
  for (const [hex, c] of cells) {
    const fams = (Object.entries(c.points) as [Family, number][]).filter(([, v]) => v >= 0.3)
    if (!fams.length) continue
    const raw = fams.reduce((s, [, v]) => s + v, 0)
    // Independent kinds of evidence agreeing in one place is the strong signal (reports count as one kind)
    const classes = new Set(fams.map(([k]) => CLASS[k])).size
    const boost = 1 + 0.4 * (classes - 1)
    const score = Math.round(100 * (1 - Math.exp(-(raw * boost) / 35)))
    if (score < MIN_SCORE) continue
    const [lat, lon] = cellToLatLng(hex)
    const ring = cellToBoundary(hex, true).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])
    const drivers = fams.sort((a, b) => b[1] - a[1])
    out.push({
      id: `cii:h3:${hex}`,
      layerId: 'cii',
      title: `Instability ${score}/100: ${drivers.slice(0, 2).map(([k]) => FAMILY_LABEL[k]).join(' + ')}`,
      position: { lat, lon },
      geometry: { type: 'Polygon', coordinates: [ring] },
      geoPrecision: 'approximate',
      geoBasis: 'H3 cell (~1,800 km²): signals inside it and, at a third of their weight, in the cells around it',
      observedAt: new Date(now).toISOString(),
      source: { provider: 'instability-heatmap', platform: 'ARGUS', retrievedAt: new Date(now).toISOString() },
      tags: ['instability', ...drivers.map(([k]) => k)],
      props: {
        kind: 'heat',
        score,
        country: countryAt(lat, lon),
        families: drivers.map(([k, v]) => ({ id: k, label: FAMILY_LABEL[k], points: Math.round(v * 10) / 10 })),
        corroboration: classes,
        top: c.items.sort((a, b) => b.w - a.w).slice(0, 6).map(({ id, title }) => ({ id, title })),
      },
    })
  }
  return out.sort((a, b) => Number(b.props.score) - Number(a.props.score)).slice(0, MAX_CELLS)
}

async function rebuild() {
  try {
    features = await computeHeatmap()
    builtAt = Date.now()
  } catch (e) {
    console.warn(`[heatmap] ${e instanceof Error ? e.message : String(e)}`)
  }
}

export const heatmapFeatures = () => features
export const heatmapBuiltAt = () => builtAt

let started = false
export function startHeatmap(all: Record<string, Provider[]>) {
  if (started) return
  started = true
  layers = all
  setTimeout(() => void rebuild(), 100_000)
  setInterval(() => void rebuild(), EVERY_MS)
}
