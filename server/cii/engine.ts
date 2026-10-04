import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json' with { type: 'json' }
import type { Feature } from '../../shared/feature.ts'
import { loadLayer } from '../core/aggregate.ts'
import { streamSource } from '../core/hub.ts'
import type { Provider } from '../core/provider.ts'
import { centroidOf, countryAt, countryNameForId } from '../geo/gazetteer.ts'

/**
 * COUNTRY INSTABILITY INDEX. A transparent 0-100 score per country, rebuilt
 * every few minutes from what the other layers already see: armed-clash and
 * protest activity, news and Telegram attention, flagged narratives, internet
 * shutdowns, GNSS jamming, prediction-market moves and search trends.
 * Every point is explained by a component, so an analyst can see why a
 * country is high, and nothing here is a forecast.
 *
 * Each component saturates (1 - e^(-x/k)) so one noisy feed cannot dominate.
 */

export const LAYER_ID = 'cii'
const EVERY_MS = 10 * 60_000 // country scores move slowly; every 10 min is plenty

export type Component = { id: string; label: string; value: number; points: number; max: number; detail: string }
export type CountryScore = { country: string; score: number; delta?: number; components: Component[] }

type Spec = { id: string; label: string; max: number; k: number; unit: string }
const SPECS: Spec[] = [
  { id: 'conflict', label: 'Clashes & protests', max: 35, k: 60, unit: 'severity-weighted events (GDELT/ACLED, 24 h)' },
  { id: 'attention', label: 'News & Telegram attention', max: 15, k: 12, unit: 'stories + posts/3' },
  { id: 'disinfo', label: 'Flagged narratives', max: 10, k: 2, unit: 'campaign-flagged or contradicted stories' },
  { id: 'outage', label: 'Internet shutdowns & censorship', max: 15, k: 2, unit: 'outage/censorship signals' },
  { id: 'jamming', label: 'GNSS jamming', max: 10, k: 4, unit: 'jammed cells × intensity' },
  { id: 'markets', label: 'Market moves', max: 5, k: 2, unit: 'real-money markets moving ≥5 pts/24 h' },
  { id: 'trends', label: 'Search trends', max: 10, k: 2, unit: 'security terms trending' },
  { id: 'cyber', label: 'Cyber attacks', max: 5, k: 4, unit: 'ransomware claims + online botnet servers' },
]

// GDELT event classes by severity: political rhetoric ("fight", "attack" in a speech) often lands in the
// clash codes, so violence counts fully and protest/coercion partly.
const SEVERITY: Record<string, number> = { 'mass violence': 1.5, 'armed clash': 1, assault: 0.8, coercion: 0.5, 'show of force': 0.5, protest: 0.4 }
// GDELT over-represents countries with very large English-language press: the same unrest
// generates far more coded events there. Damp them so volume of coverage is not read as instability.
const COVERAGE_BIAS: Record<string, number> = { 'United States': 0.35, 'United Kingdom': 0.5, Canada: 0.6, Australia: 0.6, India: 0.7 }

const gdeltWeight = (f: Feature) => {
  const b = f.props.breakdown as Record<string, number> | undefined
  if (!b) return Number(f.props.count) || 1
  return Object.entries(b).reduce((n, [k, v]) => n + v * (SEVERITY[k] ?? 0.5), 0)
}

const topo = countries110 as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
const SHAPES = new Map(
  feature(topo, topo.objects.countries).features.map((f) => [countryNameForId(String(f.id ?? f.properties.name), f.properties.name), f.geometry]),
)

let layers: Record<string, Provider[]> = {}
let current: CountryScore[] = []
let features: Feature[] = []
let builtAt = 0
const history = new Map<string, { at: number; score: number }[]>()

async function layer(id: string): Promise<Feature[]> {
  const live = streamSource(id)
  if (live) return live.snapshot().features
  const p = layers[id]
  return p ? (await loadLayer(id, p)).features : []
}

const where = (f: Feature) => (f.position ? countryAt(f.position.lat, f.position.lon) : undefined)

export async function computeScores(): Promise<CountryScore[]> {
  const [unrest, acled, news, telegram, campaigns, osint, gnss, markets, trends, cyber] = await Promise.all(
    ['unrest', 'acled', 'news', 'telegram', 'campaigns', 'osint', 'gnss', 'markets', 'trends', 'cyber'].map((id) => layer(id).catch(() => [] as Feature[])),
  )
  const raw = new Map<string, Record<string, number>>()
  const add = (country: string | undefined, comp: string, v: number) => {
    if (!country || !v) return
    const r = raw.get(country) ?? {}
    r[comp] = (r[comp] ?? 0) + v
    raw.set(country, r)
  }
  for (const f of unrest) {
    const c = where(f)
    add(c, 'conflict', gdeltWeight(f) * (COVERAGE_BIAS[c ?? ''] ?? 1))
  }
  // Human-curated events (ACLED, Wikipedia) weigh more than machine-coded ones; deaths add weight.
  for (const f of acled) add(where(f), 'conflict', (Number(f.props.events) || 3) + (Number(f.props.fatalities) || 0) / 3)
  for (const f of news) add(where(f), 'attention', 1)
  for (const f of telegram) add(where(f), 'attention', 1 / 3)
  for (const f of campaigns) add(where(f), 'disinfo', 1)
  for (const f of news) if (['debunked', 'disputed'].includes(String(f.props.verdict))) add(where(f), 'disinfo', 1)
  for (const f of osint) {
    const cat = String(f.props.category ?? '')
    if (/outage|censorship|block|shutdown/i.test(cat)) add(where(f), 'outage', f.props.severity === 'high' ? 2 : 1)
  }
  for (const f of gnss) add(where(f), 'jamming', Number(f.props.intensity) || 0)
  for (const f of markets) if (!f.props.playMoney && Math.abs(Number(f.props.change24h) || 0) >= 0.05) add(where(f), 'markets', 1)
  for (const f of trends) add(where(f), 'trends', Number(f.props.securityTerms) || 0)
  for (const f of cyber) if (f.props.kind === 'ransomware' || (f.props.kind === 'c2' && Number(f.props.online) > 0)) add(String(f.props.country ?? '') || where(f), 'cyber', f.props.kind === 'c2' ? Number(f.props.online) : 1)

  const now = Date.now()
  const out: CountryScore[] = []
  for (const [country, r] of raw) {
    const components = SPECS.map((s) => {
      const value = r[s.id] ?? 0
      const points = s.max * (1 - Math.exp(-value / s.k))
      return { id: s.id, label: s.label, value: Math.round(value * 10) / 10, points: Math.round(points * 10) / 10, max: s.max, detail: s.unit }
    })
    const score = Math.round(components.reduce((n, c) => n + c.points, 0))
    if (score < 3) continue
    const h = (history.get(country) ?? []).filter((x) => now - x.at <= 3 * 3600_000)
    const base = h.find((x) => now - x.at >= 50 * 60_000)
    h.push({ at: now, score })
    history.set(country, h)
    out.push({ country, score, ...(base ? { delta: score - base.score } : {}), components })
  }
  return out.sort((a, b) => b.score - a.score)
}

const color = (score: number) => (score >= 60 ? '#ef4444' : score >= 40 ? '#f97316' : score >= 20 ? '#eab308' : '#64748b')

function toFeature(c: CountryScore, rank: number): Feature {
  const pos = centroidOf(c.country)
  const top = [...c.components].sort((a, b) => b.points - a.points).filter((x) => x.points >= 1).slice(0, 3)
  return {
    id: `${LAYER_ID}:${c.country}`,
    layerId: LAYER_ID,
    title: `${c.country}: ${c.score}`,
    ...(pos ? { position: pos } : {}),
    ...(SHAPES.get(c.country) ? { geometry: SHAPES.get(c.country) as Feature['geometry'] } : {}),
    geoPrecision: 'exact',
    geoBasis: 'country boundary (Natural Earth 1:110m)',
    observedAt: new Date(builtAt).toISOString(),
    source: { provider: 'cii', platform: 'panoptes', retrievedAt: new Date(builtAt).toISOString() },
    tags: ['cii'],
    props: { kind: 'cii', country: c.country, score: c.score, delta: c.delta, rank: rank + 1, color: color(c.score), components: c.components, drivers: top.map((x) => x.label).join(', ') },
  }
}

async function rebuild() {
  try {
    current = await computeScores()
    builtAt = Date.now()
    features = current.map(toFeature)
  } catch (e) {
    console.warn(`[cii] rebuild failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export const snapshotScores = () => ({ generatedAt: new Date(builtAt || Date.now()).toISOString(), countries: current })
export const ciiFeatures = () => features

let started = false
export function startCii(all: Record<string, Provider[]>) {
  if (started) return
  started = true
  layers = all
  // Let the engines prime first; then refresh on a fixed cadence.
  setTimeout(() => void rebuild(), 90_000)
  setInterval(() => void rebuild(), EVERY_MS)
}
