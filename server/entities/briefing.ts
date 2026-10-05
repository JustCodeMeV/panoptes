import type { Entity } from '../../shared/entities.ts'
import { snapshotScores } from '../cii/engine.ts'
import type { Feature } from '../../shared/feature.ts'
import { countryAt } from '../geo/gazetteer.ts'
import { liveFeature } from './engine.ts'
import { allEntities, edgesOf, getEntity } from './graph.ts'
import { km } from './resolve.ts'

/**
 * BRIEFING: what needs attention now. Ranks the resolved, checked events of the
 * last two days by how much is happening (sources, kind, casualties), how fresh
 * it is, how unstable the country is, and whether the evidence is in doubt
 * (contested, debunked, government-only) — then says why, in plain words.
 * At most two situations per country, so one war does not fill the list.
 */

export type BriefItem = {
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
  firstSeen: number
  lastSeen: number
  featureId?: string
  score: number
}

const KIND_WEIGHT: Record<string, number> = {
  strike: 10,
  'drone-attack': 10,
  'missile-test': 9,
  shelling: 9,
  clash: 9,
  explosion: 8,
  'military-exercise': 5,
  disaster: 6,
  outbreak: 6,
  humanitarian: 5,
  protest: 5,
  arrest: 4,
  cyber: 4,
  ceasefire: 6,
  talks: 3,
  sanction: 3,
  'navigation-warning': 3,
  'space-weather': 1,
  other: -20,
}
const DOUBT: Record<string, string> = {
  contested: 'sources contradict each other',
  debunked: 'a fact-check rates a matching claim false',
  'government-only': 'only government outlets report it so far',
}
const H = 3_600_000
const ago = (ms: number) => (ms < H ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / H)} h`)

function placeOf(e: Entity): { place?: string; country?: string } {
  const loc = edgesOf(e.id, ['located_at'])
    .map((x) => getEntity(x.to))
    .find(Boolean)
  if (!loc) return {}
  return {
    place: loc.label,
    country: loc.precision === 'country' ? loc.label : (loc.props.country as string | undefined),
  }
}

/** Scores one checked event and says why it matters, in plain words. */
export function explain(e: Entity, cii: Map<string, number>, now = Date.now()): BriefItem | null {
  if (e.type !== 'event' || !e.check) return null
  const c = e.check
  const { place, country } = placeOf(e)
  const casualties = Number(e.props.casualties) || 0
  const instability = country ? (cii.get(country) ?? 0) : 0
  const fresh = Math.max(0, 1 - (now - e.lastSeen) / (24 * H))
  const score =
    Math.log2(1 + c.sources) * 8 +
    c.independent * 4 +
    c.countries * 3 +
    (KIND_WEIGHT[e.subtype] ?? 0) +
    fresh * 25 +
    (DOUBT[c.status] ? 8 : 0) +
    Math.min(15, Math.log2(1 + casualties) * 4) +
    instability / 10
  const why: string[] = []
  if (now - e.firstSeen < 6 * H) why.push(`new: first reported ${ago(now - e.firstSeen)} ago`)
  else if (now - e.lastSeen < 2 * H) why.push(`still developing: last report ${ago(now - e.lastSeen)} ago`)
  if (c.sources >= 3) why.push(`${c.sources} sources report it`)
  if (casualties) why.push(`casualties reported: ${casualties}`)
  if (DOUBT[c.status]) why.push(DOUBT[c.status])
  if (instability >= 40) why.push(`${country} is unstable right now (index ${instability}/100)`)
  return {
    id: e.id,
    title: e.label,
    kind: e.subtype,
    place,
    country,
    position: e.position,
    status: c.status,
    reasons: c.reasons,
    why,
    sources: c.sources,
    independent: c.independent,
    countries: c.countries,
    firstSeen: e.firstSeen,
    lastSeen: e.lastSeen,
    featureId: (e.props.featureIds as string[] | undefined)?.[0],
    score: Math.round(score),
  }
}

export function briefing(limit = 8, now = Date.now()): BriefItem[] {
  const cii = new Map(snapshotScores().countries.map((c) => [c.country, c.score]))
  const ranked: BriefItem[] = []
  for (const e of allEntities()) {
    if (e.type !== 'event' || !e.check || now - e.lastSeen > 48 * H) continue
    if (e.subtype === 'other' && e.check.sources < 3) continue
    const item = explain(e, cii, now)
    if (item) ranked.push(item)
  }
  ranked.sort((a, b) => b.score - a.score)
  const perCountry = new Map<string, number>()
  const out: BriefItem[] = []
  for (const r of ranked) {
    const k = r.country ?? r.id
    if ((perCountry.get(k) ?? 0) >= 2) continue
    perCountry.set(k, (perCountry.get(k) ?? 0) + 1)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}

/**
 * An item that is not (yet) part of a checked event: what surrounds it. The country's instability,
 * how much checked activity there is around it, the nearest checked event, and the plain fact that it
 * is one unconfirmed source so far.
 */
function context(f: Feature, now: number): BriefItem {
  const cii = new Map(snapshotScores().countries.map((c) => [c.country, c.score]))
  const country = f.position ? countryAt(f.position.lat, f.position.lon) : typeof f.props.country === 'string' ? f.props.country : undefined
  const why: string[] = ['not confirmed yet: no other source has reported the same event so far']
  let nearest: { e: Entity; d: number } | null = null
  let inCountry = 0
  for (const e of allEntities()) {
    if (e.type !== 'event' || !e.check || now - e.lastSeen > 24 * H) continue
    if (country && placeOf(e).country === country) inCountry++
    if (f.position && e.position) {
      const d = km(f.position, e.position)
      if (d < 100 && (!nearest || d < nearest.d)) nearest = { e, d }
    }
  }
  if (nearest) why.push(`nearest checked event, ${Math.round(nearest.d)} km away: ${nearest.e.label.slice(0, 90)}`)
  if (country && inCountry) why.push(`${inCountry} checked event${inCountry === 1 ? '' : 's'} in ${country} in the last 24 h`)
  const instability = country ? (cii.get(country) ?? 0) : 0
  if (instability >= 25) why.push(`${country} instability index: ${instability}/100`)
  if (!nearest && !inCountry) why.push('nothing else checked around it in the last 24 h: treat it as a lead')
  return {
    id: f.id, title: f.title, kind: 'unchecked', country, position: f.position, status: 'unchecked', reasons: [], why,
    sources: 1, independent: 0, countries: 0, firstSeen: Date.parse(f.observedAt) || now, lastSeen: Date.parse(f.observedAt) || now, score: 0,
  }
}

/** Why one item matters: the checked event it belongs to, explained; else what surrounds it. */
export async function whyFeature(rawId: string, now = Date.now()): Promise<BriefItem | null> {
  // Region-watch alerts wrap the original item; campaign stories are news stories
  const featureId = rawId.replace(/^watch:[^:]+:/, '').replace(/^campaigns:/, 'news:').replace(/^events:/, '')
  const direct = getEntity(featureId)
  const e =
    direct?.type === 'event'
      ? direct
      : allEntities().find((x) => x.type === 'event' && ((x.props.featureIds as string[] | undefined) ?? []).includes(featureId))
  if (e) return explain(e, new Map(snapshotScores().countries.map((c) => [c.country, c.score])), now)
  const f = await liveFeature(featureId)
  return f ? context(f, now) : null
}
