import type { Feature } from '../../shared/feature.ts'
import { peekFeatures } from '../core/aggregate.ts'
import { streamSource } from '../core/hub.ts'
import type { Provider } from '../core/provider.ts'
import { snapshotScores } from '../cii/engine.ts'
import { hotspotsIn } from '../cii/heatmap.ts'
import { centroidOf, countryAt } from '../geo/gazetteer.ts'
import { BLOCS, COUNTRIES, NUCLEAR, SANCTIONED, blocsOf, displayName, findCountry, percentile, type CountryRecord } from './countries.ts'

/**
 * COUNTRY PROFILE (the atlas). Static reference data (Factbook) + fresh
 * numbers (World Bank, Wikipedia, FX) + what is happening there right now
 * (every live layer, matched by country polygon), plus grand-strategy style
 * stat cards and relations. No AI: every line is sourced.
 */

let layers: Record<string, Provider[]> = {}
export const setAtlasLayers = (l: Record<string, Provider[]>) => (layers = l)

/** What a layer already holds; never wakes a layer nobody is viewing (ships, aircraft, markets...). */
async function features(id: string): Promise<Feature[]> {
  const live = streamSource(id)
  if (live) return live.snapshot().features
  const p = layers[id]
  return p ? peekFeatures(p) : []
}

const cache = new Map<string, { at: number; v: unknown }>()
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T | null> {
  const c = cache.get(key)
  if (c && Date.now() - c.at < ttl) return c.v as T
  try {
    const v = await fn()
    cache.set(key, { at: Date.now(), v })
    return v
  } catch {
    return (c?.v as T) ?? null
  }
}

const WB = { gdp: 'NY.GDP.MKTP.CD', gdpPc: 'NY.GDP.PCAP.CD', growth: 'NY.GDP.MKTP.KD.ZG', inflation: 'FP.CPI.TOTL.ZG', military: 'MS.MIL.XPND.GD.ZS', population: 'SP.POP.TOTL', unemployment: 'SL.UEM.TOTL.ZS' }

/** Latest World Bank values; the Factbook FIPS code is not ISO, so World Bank is queried by country name search once. */
async function worldBank(name: string) {
  return cached(`wb:${name}`, 24 * 3600_000, async () => {
    const list = (await cached('wb:list', 7 * 86400_000, async () => (await (await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400', { signal: AbortSignal.timeout(12_000) })).json()) as [unknown, { id: string; name: string; region: { value: string } }[]])) ?? [null, []]
    const n = name.toLowerCase()
    const c = list[1].find((x) => x.name.toLowerCase() === n) ?? list[1].find((x) => x.name.toLowerCase().startsWith(n.split(' ')[0]))
    if (!c) return null
    const out: Record<string, { value: number; year: string } | undefined> = {}
    await Promise.all(
      Object.entries(WB).map(async ([k, ind]) => {
        const r = (await (await fetch(`https://api.worldbank.org/v2/country/${c.id}/indicator/${ind}?format=json&mrnev=1`, { signal: AbortSignal.timeout(12_000) })).json()) as [unknown, { value: number; date: string }[] | null]
        const v = r[1]?.[0]
        if (v && v.value !== null) out[k] = { value: v.value, year: v.date }
      }),
    )
    return { iso3: c.id, ...out }
  })
}

async function wikipedia(name: string) {
  return cached(`wiki:${name}`, 24 * 3600_000, async () => {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`, { headers: { 'user-agent': 'panoptes-research/0.1' }, signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return null
    const j = (await r.json()) as { extract?: string; description?: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } }
    return { extract: j.extract, description: j.description, image: j.thumbnail?.source, url: j.content_urls?.desktop?.page }
  })
}

// Straits and chokepoints that make a coastline strategic.
const CHOKEPOINTS: { name: string; lat: number; lon: number }[] = [
  { name: 'Strait of Hormuz', lat: 26.57, lon: 56.25 }, { name: 'Bab el-Mandeb', lat: 12.58, lon: 43.33 }, { name: 'Suez Canal', lat: 30.59, lon: 32.27 },
  { name: 'Strait of Malacca', lat: 2.5, lon: 101.5 }, { name: 'Bosporus', lat: 41.12, lon: 29.05 }, { name: 'Strait of Gibraltar', lat: 35.95, lon: -5.6 },
  { name: 'Taiwan Strait', lat: 24.5, lon: 119.5 }, { name: 'Panama Canal', lat: 9.1, lon: -79.7 }, { name: 'Danish Straits', lat: 55.6, lon: 12.7 },
  { name: 'Kerch Strait', lat: 45.3, lon: 36.5 }, { name: 'Strait of Dover', lat: 51.0, lon: 1.5 }, { name: 'Cape of Good Hope', lat: -34.36, lon: 18.47 },
  { name: 'Lombok Strait', lat: -8.7, lon: 115.7 }, { name: 'GIUK gap', lat: 63.0, lon: -15.0 },
]
const rad = (d: number) => (d * Math.PI) / 180
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2))

type Card = { id: string; label: string; value: string; grade: string; pct?: number; hint: string }
/** Rank among all countries, as a game-style tier. */
const grade = (p?: number) => (p === undefined ? 'n/a' : p >= 95 ? 'Top 5%' : p >= 90 ? 'Top 10%' : p >= 75 ? 'Top quarter' : p >= 50 ? 'Above median' : p >= 25 ? 'Below median' : 'Bottom quarter')
const fmtMoney = (v?: number) => (v === undefined ? '–' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)} T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)} B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)} M` : `$${Math.round(v)}`)
const fmtNum = (v?: number) => (v === undefined ? '–' : v >= 1e9 ? `${(v / 1e9).toFixed(2)} B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)} K` : String(v))

function cards(c: CountryRecord, cii?: number): Card[] {
  const oilNet = (c.oil.productionBbl ?? 0) - (c.oil.consumptionBbl ?? 0)
  const gasNet = (c.gas.productionM3 ?? 0) - (c.gas.consumptionM3 ?? 0)
  const energy = oilNet > 50_000 || gasNet > 5e9 ? 'Exporter' : oilNet < -50_000 || gasNet < -5e9 ? 'Importer' : 'Balanced'
  const openness = c.gdpUsd && c.exportsUsd && c.importsUsd ? ((c.exportsUsd + c.importsUsd) / c.gdpUsd) * 100 : undefined
  const pPop = percentile((x) => x.population, c.population)
  const pGdp = percentile((x) => x.gdpUsd, c.gdpUsd)
  const pPc = percentile((x) => x.gdpPerCapita, c.gdpPerCapita)
  const pInd = percentile((x) => (x.gdpUsd && x.composition.industry ? (x.gdpUsd * x.composition.industry) / 100 : undefined), c.gdpUsd && c.composition.industry ? (c.gdpUsd * c.composition.industry) / 100 : undefined)
  const pMil = percentile((x) => (x.gdpUsd && x.military.expenditurePct ? (x.gdpUsd * x.military.expenditurePct) / 100 : undefined), c.gdpUsd && c.military.expenditurePct ? (c.gdpUsd * c.military.expenditurePct) / 100 : undefined)
  return [
    { id: 'population', label: 'Population', value: fmtNum(c.population), grade: grade(pPop), pct: pPop, hint: `median age ${c.medianAge ?? '–'}, ${c.urbanPct ?? '–'}% urban` },
    { id: 'economy', label: 'Economy', value: fmtMoney(c.gdpUsd), grade: grade(pGdp), pct: pGdp, hint: `growth ${c.gdpGrowth ?? '–'}%, inflation ${c.inflation ?? '–'}%` },
    { id: 'wealth', label: 'Wealth', value: c.gdpPerCapita ? `$${c.gdpPerCapita.toLocaleString('en-US')}` : '–', grade: grade(pPc), pct: pPc, hint: 'GDP per person (PPP)' },
    { id: 'industry', label: 'Industry', value: c.composition.industry ? `${c.composition.industry}% of GDP` : '–', grade: grade(pInd), pct: pInd, hint: c.industries.slice(0, 3).join(', ') },
    { id: 'energy', label: 'Energy', value: energy, grade: energy, hint: `oil ${fmtNum(c.oil.productionBbl)} bbl/d produced, ${fmtNum(c.oil.consumptionBbl)} used` },
    { id: 'military', label: 'Military', value: c.military.expenditurePct ? `${c.military.expenditurePct}% of GDP` : '–', grade: NUCLEAR.has(c.name) ? 'Nuclear power' : grade(pMil), pct: pMil, hint: c.gdpUsd && c.military.expenditurePct ? `≈ ${fmtMoney((c.gdpUsd * c.military.expenditurePct) / 100)} a year` : 'spending not reported' },
    { id: 'stability', label: 'Stability', value: cii === undefined ? 'calm' : `worst area ${cii}/100`, grade: cii === undefined ? 'Stable' : cii >= 60 ? 'Crisis zone' : cii >= 40 ? 'Unstable areas' : cii >= 20 ? 'Tense areas' : 'Stable', pct: cii === undefined ? 100 : 100 - cii, hint: cii === undefined ? 'no unstable area on the heatmap' : `the most unstable area of the country scores ${cii}/100 on the heatmap; the rest may be calm` },
    { id: 'trade', label: 'Trade openness', value: openness ? `${Math.round(openness)}% of GDP` : '–', grade: openness === undefined ? 'n/a' : openness > 100 ? 'Hub' : openness > 60 ? 'Open' : openness > 30 ? 'Moderate' : 'Closed', hint: `exports ${fmtMoney(c.exportsUsd)}, imports ${fmtMoney(c.importsUsd)}` },
  ]
}

function relations(c: CountryRecord, conflictHot: Set<string>) {
  const mine = new Set(blocsOf(c))
  const allies: { name: string; via: string[] }[] = []
  for (const o of Object.values(COUNTRIES)) {
    if (o.name === c.name) continue
    const shared = blocsOf(o).filter((b) => mine.has(b) && ['NATO', 'CSTO', 'EU', 'GCC', 'SCO', 'EAEU', 'ASEAN'].includes(b))
    if (shared.length) allies.push({ name: displayName(o.name), via: shared })
  }
  const neighbours = c.borders.map((b) => ({ name: displayName(findCountry(b.name)?.name ?? b.name), km: b.km, tense: conflictHot.has(findCountry(b.name)?.name ?? b.name) }))
  const dependencies = [
    ...c.exportPartners.filter((p) => p.share >= 10).map((p) => ({ name: displayName(findCountry(p.name)?.name ?? p.name), share: p.share, way: 'exports to' as const })),
    ...c.importPartners.filter((p) => p.share >= 10).map((p) => ({ name: displayName(findCountry(p.name)?.name ?? p.name), share: p.share, way: 'imports from' as const })),
  ]
  return { blocs: [...mine].map((b) => ({ id: b, name: BLOCS[b] })), allies: allies.slice(0, 40), neighbours, dependencies, disputes: c.disputes }
}

/** Waits at most `ms` for a slow lookup; it keeps running and lands in the cache for the next open. */
const soon = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])

/** Assembles the full country profile. `name` may be a gazetteer, Factbook or shorthand name. */
export async function countryProfile(name: string) {
  const c = findCountry(name)
  if (!c) return null
  const display = displayName(c.name)
  // External enrichments never hold the profile up for more than ~1 s.
  const [wb, wiki, fx] = await Promise.all([
    soon(worldBank(display), 1200),
    soon(wikipedia(c.name === 'West Bank' ? 'State of Palestine' : display), 1200),
    c.currency ? soon(cached('fx', 3600_000, async () => ((await (await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(10_000) })).json()) as { rates: Record<string, number> }).rates), 1200) : null,
  ])
  const code = c.currency?.match(/\(([A-Z]{3})\)/)?.[1]
  const ciiRow = snapshotScores().countries.find((x) => findCountry(x.country)?.name === c.name)
  const inCountry = (f: Feature) => (f.position ? findCountry(countryAt(f.position.lat, f.position.lon) ?? '')?.name === c.name : false)
  const [events, unrest, telegram, news, markets, trends, ships, air, fin] = await Promise.all(['events', 'unrest', 'telegram', 'news', 'markets', 'trends', 'ships', 'military-air', 'finance'].map((l) => features(l)))
  const pick = (fs: Feature[], n = 5) => fs.slice(0, n).map((f) => ({ id: f.id, title: f.title, at: f.observedAt, props: { check: (f.props.check as { status?: string } | undefined)?.status, sources: f.props.sources, p: f.props.p, headline: f.props.headline } }))
  const evIn = events.filter(inCountry).sort((a, b) => Number(b.props.sources ?? 0) - Number(a.props.sources ?? 0))
  const conflictHot = new Set(snapshotScores().countries.filter((x) => (x.components.find((k) => k.id === 'conflict')?.points ?? 0) >= 15).map((x) => findCountry(x.country)?.name ?? x.country))
  const centre = centroidOf(display) ?? centroidOf(c.name)
  const strategic: string[] = []
  if (NUCLEAR.has(c.name)) strategic.push('Nuclear-armed state')
  if (SANCTIONED.has(c.name)) strategic.push('Under broad international sanctions')
  if ((c.oil.reservesBbl ?? 0) > 10e9) strategic.push(`Large oil reserves: ${fmtNum(c.oil.reservesBbl)} barrels`)
  if ((c.gas.exportsM3 ?? 0) > 10e9) strategic.push(`Major gas exporter: ${fmtNum(c.gas.exportsM3)} m³/yr`)
  if (centre) for (const k of CHOKEPOINTS) if (km(centre, k) < 550) strategic.push(`Near ${k.name}`)
  for (const b of blocsOf(c).filter((b) => ['NATO', 'CSTO', 'OPEC', 'BRICS', 'SCO', 'G-7'].includes(b))) strategic.push(`Member of ${BLOCS[b]}`)
  if (c.terroristGroups.length) strategic.push(`Armed groups active: ${c.terroristGroups.slice(0, 3).join(', ')}`)
  // Instability is local: name the unstable areas, never the whole country
  const hot = hotspotsIn(display).cells ? hotspotsIn(display) : hotspotsIn(c.name)
  if (hot.max >= 40) strategic.push(`Unstable areas right now: ${hot.cells} (worst ${hot.max}/100: ${hot.drivers.join(' + ')})`)
  return {
    name: display,
    factbookName: c.name,
    record: c,
    wiki,
    worldBank: wb,
    currency: code && fx ? { code, name: c.currency, perUsd: fx[code] } : c.currency ? { name: c.currency, perUsd: c.usdRate } : null,
    cards: cards(c, hot.cells ? hot.max : undefined),
    relations: relations(c, conflictHot),
    strategic,
    position: centre,
    now: {
      cii: ciiRow ?? null,
      hotspots: hot,
      events: { count: evIn.length, top: pick(evIn) },
      unrest: { count: unrest.filter(inCountry).length, top: pick(unrest.filter(inCountry), 3) },
      telegram: { count: telegram.filter(inCountry).length, top: pick(telegram.filter(inCountry), 3) },
      news: { count: news.filter(inCountry).length, top: pick(news.filter(inCountry)) },
      markets: pick(markets.filter((m) => new RegExp(`\\b${display}\\b`, 'i').test(m.title)), 4),
      trends: trends.find((t) => findCountry(String(t.props.country ?? ''))?.name === c.name)?.props.trends ?? null,
      // Its stock index and currency on the world markets (if listed).
      finance: fin.filter((f) => findCountry(String(f.props.country ?? ''))?.name === c.name || (code && String(f.props.sym ?? '').includes(code))).map((f) => ({ id: f.id, name: f.props.name, price: f.props.price, day: f.props.day, month: f.props.month })),
      ships: ships.filter(inCountry).length,
      aircraft: air.filter(inCountry).length,
    },
  }
}

/** Aggregate profile for a bloc (EU, NATO, OPEC...): members and combined weight. */
export function blocProfile(id: string) {
  const members = Object.values(COUNTRIES).filter((c) => c.organizations.includes(id))
  if (!members.length) return null
  const sum = (f: (c: CountryRecord) => number | undefined) => members.reduce((n, c) => n + (f(c) ?? 0), 0)
  return {
    id,
    name: BLOCS[id] ?? id,
    members: members.map((m) => displayName(m.name)),
    population: sum((c) => c.population),
    gdpUsd: sum((c) => c.gdpUsd),
    militaryUsd: sum((c) => (c.gdpUsd && c.military.expenditurePct ? (c.gdpUsd * c.military.expenditurePct) / 100 : undefined)),
    nuclear: members.filter((m) => NUCLEAR.has(m.name)).map((m) => displayName(m.name)),
  }
}

/** Live items matching a test (inside a region, near a city), counted per layer, newest first. Never wakes a layer. */
export async function liveWhere(test: (f: Feature) => boolean) {
  const ids = ['events', 'acled', 'unrest', 'news', 'telegram', 'warnings', 'humanitarian', 'hazards', 'osint', 'cyber', 'statements', 'ships', 'military-air']
  // Items only placed at a country's centre (approximate) say nothing about a region or city inside it
  const all = await Promise.all(ids.map(async (id) => [id, (await features(id)).filter((f) => f.position && f.geoPrecision !== 'approximate' && test(f))] as const))
  const counts = Object.fromEntries(all.filter(([, fs]) => fs.length).map(([id, fs]) => [id, fs.length]))
  const top = all
    .filter(([id]) => !['ships', 'military-air'].includes(id))
    .flatMap(([, fs]) => fs)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    .slice(0, 10)
    .map((f) => ({ id: f.id, title: f.title, layerId: f.layerId, at: f.observedAt }))
  return { counts, top }
}
