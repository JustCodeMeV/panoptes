import type { Check, Entity } from '../../shared/entities.ts'
import { establishedOutlet, outletCountry, stateOutlet } from '../truth/domains.ts'
import { tokenSet } from '../truth/text.ts'
import { allEntities, edgesOf, getEntity, mergeInto } from './graph.ts'

/**
 * ENTITY RESOLUTION: reports of the same event become one event entity.
 * A news story, the Telegram posts about it, a Wikipedia log entry and a
 * GDELT hotspot merge when they are the same kind of event (or one is
 * untyped), close in space and time, and share an actor or distinctive words.
 */

const KM = 30
const WINDOW_MS = 6 * 3600_000

const rad = (d: number) => (d * Math.PI) / 180
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

const actorsOf = (id: string) => new Set(edgesOf(id, ['involves']).map((e) => e.to))
const words = (e: Entity) => new Set([...tokenSet(e.label)].filter((t) => t.length >= 5))

function sameEvent(a: Entity, b: Entity): boolean {
  if (a.subtype !== b.subtype && a.subtype !== 'other' && b.subtype !== 'other') return false
  if (Math.abs(a.firstSeen - b.firstSeen) > WINDOW_MS) return false
  if (!a.position || !b.position) return false
  // Country-level positions only merge on strong text overlap; town-level ones by distance.
  const coarse = a.precision === 'country' || b.precision === 'country'
  if (km(a.position, b.position) > (coarse ? 5 : KM)) return false
  const sharedActor = [...actorsOf(a.id)].some((x) => actorsOf(b.id).has(x))
  const wa = words(a)
  let shared = 0
  for (const w of words(b)) if (wa.has(w)) shared++
  return coarse ? shared >= 3 : sharedActor || shared >= 2
}

/** Merges `ids` (new or changed events) into existing ones where they match. Returns surviving ids. */
export function resolveEvents(ids: string[]): Set<string> {
  const survivors = new Set<string>()
  const events = allEntities().filter((e) => e.type === 'event')
  for (const id of ids) {
    const e = getEntity(id)
    if (!e) continue
    // Prefer the older, better-sourced event as the canonical one.
    const match = events.find((o) => o.id !== id && getEntity(o.id) && sameEvent(o, e))
    if (match) {
      const keep = edgesOf(match.id, ['reported_by']).length >= edgesOf(id, ['reported_by']).length ? match : e
      const drop = keep === match ? e : match
      const featureIds = [...new Set([...((keep.props.featureIds as string[]) ?? []), ...((drop.props.featureIds as string[]) ?? [])])]
      if (keep.subtype === 'other' && drop.subtype !== 'other') keep.subtype = drop.subtype
      // A real headline beats a machine label ("Sanaa: armed clash reports").
      const machine = (l: string) => / reports$/.test(l)
      const label = machine(keep.label) && !machine(drop.label) ? drop.label : keep.label
      mergeInto(drop.id, keep.id)
      getEntity(keep.id)!.label = label
      const k = getEntity(keep.id)!
      k.props.featureIds = featureIds
      k.props.kind = k.subtype
      survivors.add(keep.id)
      survivors.delete(drop.id)
    } else survivors.add(id)
  }
  return survivors
}

/**
 * CHECK: how well an event is supported, with the same rule for every
 * country. Independent outlets (private or public-service) from several
 * countries confirm; government outlets alone (any government) do not;
 * a denial or opposite roles make it contested; a fact-check debunks it.
 */
export function checkEvent(id: string): Check | undefined {
  const e = getEntity(id)
  if (!e || e.type !== 'event') return undefined
  const sources = edgesOf(id, ['reported_by']).map((x) => getEntity(x.to)).filter((s): s is Entity => !!s)
  const domains = sources.map((s) => String(s.props.domain ?? ''))
  const independent = domains.filter((d) => establishedOutlet(d))
  const gov = domains.filter((d) => stateOutlet(d))
  const countries = new Set(independent.map((d) => outletCountry(d)))
  const claims = edgesOf(id, ['about']).map((x) => getEntity(x.from)).filter((c): c is Entity => !!c && c.type === 'claim')
  const denial = claims.find((c) => c.props.stance === 'denies')
  const attackers = new Set(edgesOf(id, ['involves']).filter((x) => x.role === 'attacker').map((x) => x.to))
  const targets = new Set(edgesOf(id, ['involves']).filter((x) => x.role === 'target').map((x) => x.to))
  const flipped = [...attackers].some((a) => targets.has(a))
  const reasons: string[] = []
  let status: Check['status']
  if (e.props.verdict === 'debunked') {
    status = 'debunked'
    reasons.push('a published fact-check rates a matching claim false')
  } else if (denial || flipped) {
    status = 'contested'
    if (denial) reasons.push(`denied: "${String(denial.props.statement).slice(0, 100)}"`)
    if (flipped) reasons.push('sources disagree on who attacked whom')
  } else if (independent.length >= 2 && countries.size >= 2) {
    status = 'confirmed'
    reasons.push(`${independent.length} independent outlets from ${countries.size} countries`)
  } else if (independent.length >= 2 || (independent.length >= 1 && sources.length >= 3)) {
    status = 'corroborated'
    reasons.push(`${independent.length} independent outlet(s), ${sources.length} sources${countries.size === 1 ? ', one country' : ''}`)
  } else if (sources.length && gov.length === sources.length) {
    status = 'government-only'
    reasons.push(`only government outlets or official channels: ${[...new Set(gov.map((d) => `${d} (${outletCountry(d) ?? '?'})`))].slice(0, 3).join(', ')}`)
  } else {
    status = 'single-source'
    reasons.push(sources.length > 1 ? `${sources.length} sources, none independent` : `one source: ${domains[0] ?? 'unknown'}`)
  }
  if (gov.length && status !== 'government-only') reasons.push(`also carried by ${gov.length} government outlet(s)`)
  if (e.precision === 'country') reasons.push('located only to country level')
  if (e.precision === 'none') reasons.push('no location named')
  const check: Check = { status, reasons, sources: sources.length, independent: independent.length, countries: countries.size }
  e.check = check
  return check
}
