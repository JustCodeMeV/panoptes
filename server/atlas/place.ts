import { geoContains, type GeoPermissibleObjects } from 'd3-geo'
import { liveWhere } from './profile.ts'
import { regionsFor } from './regions.ts'

/**
 * PLACE PROFILE (a region or a city): Wikipedia summary and Wikidata facts
 * (population, area, capital, official website). Keyless; each call is capped
 * so a slow source never holds the profile up, and results are cached for a day.
 */
const UA = { 'user-agent': 'panoptes-research/0.1 (OSINT atlas)' }
const cache = new Map<string, { at: number; v: PlaceProfile }>()

export type PlaceProfile = {
  name: string
  kind: 'region' | 'city'
  country?: string
  title?: string
  description?: string
  extract?: string
  image?: string
  url?: string
  population?: { value: number; year?: string }
  areaKm2?: number
  capital?: string
  website?: string
  /** Live items inside the region / within 30 km of the city. */
  now?: Awaited<ReturnType<typeof liveWhere>>
}

const soon = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))])

async function summary(title: string) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers: UA, signal: AbortSignal.timeout(4000) })
  if (!r.ok) return null
  const j = (await r.json()) as { type?: string; title: string; description?: string; extract?: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } }; wikibase_item?: string }
  return j.type === 'disambiguation' ? null : j
}

type Claim = { mainsnak?: { datavalue?: { value: unknown } }; qualifiers?: Record<string, { datavalue?: { value: { time?: string } } }[]> }
async function wikidata(q: string) {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`, { headers: UA, signal: AbortSignal.timeout(4000) })
  if (!r.ok) return null
  const e = ((await r.json()) as { entities: Record<string, { claims: Record<string, Claim[]> }> }).entities[q]
  const c = e?.claims ?? {}
  // Latest population figure (qualifier P585 = point in time)
  const pops = (c.P1082 ?? []).map((x) => ({ value: Number((x.mainsnak?.datavalue?.value as { amount?: string })?.amount), year: x.qualifiers?.P585?.[0]?.datavalue?.value.time?.slice(1, 5) })).filter((x) => Number.isFinite(x.value))
  pops.sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))
  const area = Number((c.P2046?.[0]?.mainsnak?.datavalue?.value as { amount?: string })?.amount)
  const capitalId = (c.P36?.[0]?.mainsnak?.datavalue?.value as { id?: string })?.id
  const website = c.P856?.[0]?.mainsnak?.datavalue?.value as string | undefined
  let capital: string | undefined
  if (capitalId) {
    const l = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${capitalId}&props=labels&languages=en&format=json`, { headers: UA, signal: AbortSignal.timeout(3000) }).then((x) => x.json()).catch(() => null)
    capital = (l as { entities?: Record<string, { labels?: { en?: { value: string } } }> } | null)?.entities?.[capitalId]?.labels?.en?.value
  }
  return { population: pops[0], areaKm2: Number.isFinite(area) ? area : undefined, capital, website }
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** What is happening there now (not cached: live). */
async function nowIn(kind: 'region' | 'city', name: string, country?: string, at?: { lat: number; lon: number }) {
  if (kind === 'city' && at) return liveWhere((f) => km(f.position!, at) < 30)
  if (kind === 'region' && country) {
    const set = await regionsFor(country).catch(() => null)
    const g = set?.set.regions.find((r) => r.name === name)?.geometry
    if (g) return liveWhere((f) => geoContains(g as GeoPermissibleObjects, [f.position!.lon, f.position!.lat]))
  }
  return undefined
}

export async function placeProfile(name: string, kind: 'region' | 'city', country?: string, region?: string, at?: { lat: number; lon: number }): Promise<PlaceProfile> {
  const key = `${kind}:${name}:${country ?? ''}`
  const now = await nowIn(kind, name, country, at)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 86_400_000) return { ...hit.v, now }
  // "Kherson Oblast" and "Paris" usually resolve as is; otherwise qualify with the region or country
  const tries = [name, region ? `${name}, ${region}` : '', country ? `${name}, ${country}` : '', kind === 'region' && country ? `${name} (${country})` : ''].filter(Boolean)
  let s: Awaited<ReturnType<typeof summary>> = null
  for (const t of tries) {
    s = await soon(summary(t), 2500)
    if (s && (!country || `${s.description ?? ''} ${s.extract ?? ''}`.includes(country) || tries.length === 1)) break
  }
  const facts = s?.wikibase_item ? await soon(wikidata(s.wikibase_item), 3000) : null
  const v: PlaceProfile = {
    name,
    kind,
    country,
    title: s?.title,
    description: s?.description,
    extract: s?.extract?.slice(0, 900),
    image: s?.thumbnail?.source,
    url: s?.content_urls?.desktop?.page,
    ...(facts ?? {}),
  }
  cache.set(key, { at: Date.now(), v })
  return { ...v, now }
}
