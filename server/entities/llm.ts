import { z } from 'zod/v4'
import type { EventKind, Precision, Role } from '../../shared/entities.ts'
import { llmEnabled, memo, structured } from '../llm/client.ts'
import { ACTORS } from './actors.ts'
import { geocode } from './geocode.ts'
import { allEntities, dropEdges, edgesOf, getEntity, link, slug, upsertEntity } from './graph.ts'
import { readArticle } from './read.ts'
import { checkEvent } from './resolve.ts'
import { actorId, locationEntity } from './rules.ts'

/**
 * CLAUDE READS THE IMPORTANT ENTRIES. Rules give every entry a first pass;
 * here Claude Haiku reads the article text of events that matter (several
 * sources, or an analyst asked) and returns the precise place, the actors
 * with their real roles, the event type, casualties and who claims what.
 *
 * Budget: its own hourly cap (PANOPTES_EXTRACT_PER_HOUR, default 25), one
 * call per event, text truncated, memoized; re-read only when an event has
 * gained 3+ sources since. The shared client also enforces the global cap.
 */

const PER_HOUR = Number(process.env.PANOPTES_EXTRACT_PER_HOUR) || 25
const calls: number[] = []
const readAt = new Map<string, number>() // event id -> sources count when last read

const Extraction = z.object({
  kind: z.string().describe('One of: strike, drone-attack, shelling, clash, protest, arrest, explosion, ceasefire, talks, sanction, cyber, disaster, missile-test, other'),
  summary: z.string().describe('One neutral sentence: who did what, where, when. Attribute contested facts ("X says").'),
  place: z
    .object({
      name: z.string().describe('Most precise place the text gives: village, district, base, street, or city'),
      admin: z.string().optional().describe('Region / province / oblast'),
      country: z.string().describe('Country in English'),
      precision: z.string().describe('One of: exact, town, region, country'),
    })
    .nullable(),
  casualties: z.number().int().nullable().describe('People killed, if stated; null if not stated'),
  actors: z
    .array(
      z.object({
        name: z.string().describe('Common English name, e.g. "Houthis", "Russian Armed Forces", "Volodymyr Zelensky"'),
        type: z.string().describe('One of: military, armed-group, government, person, org, party'),
        role: z.string().describe('One of: attacker, target, victim, claimant, mediator, participant'),
      }),
    )
    .max(8),
  claims: z
    .array(z.object({ claimant: z.string(), statement: z.string().describe('What they claim, in their framing, max 25 words'), stance: z.string().describe('asserts or denies') }))
    .max(5),
})
export type Extraction = z.infer<typeof Extraction>

const SYSTEM = `You extract structured facts about ONE real-world event from news reports for an OSINT analyst.
- Use only the text given. If something is not stated, leave it null/empty; never guess.
- Be neutral between countries and blocs: attribute claims to who makes them; the same standard for every government and group.
- place.name is the most precise location the text supports; precision says how precise it is.
- An actor's role is from the event's point of view: attacker, target, victim, claimant (asserts/denies something), mediator, participant.
- Claims: statements by a party about the event (casualties, responsibility, denials), each with its claimant.`

const KINDS = ['strike', 'drone-attack', 'shelling', 'clash', 'protest', 'arrest', 'explosion', 'ceasefire', 'talks', 'sanction', 'cyber', 'disaster', 'missile-test', 'other'] as const
/** The model sometimes answers "airstrike", "drone strike", "attack": map to our kinds, never fail. */
export function kindFrom(k: string): EventKind {
  const w = k.toLowerCase()
  const hit = KINDS.find((x) => x === w)
  if (hit) return hit
  if (/drone|uav/.test(w)) return 'drone-attack'
  if (/missile test|launch|test/.test(w)) return 'missile-test'
  if (/air|strike|bomb|missile|rocket|attack/.test(w)) return 'strike'
  if (/shell|artillery|mortar/.test(w)) return 'shelling'
  if (/clash|fight|battle|offensive|combat/.test(w)) return 'clash'
  if (/protest|riot|demonstr|rally/.test(w)) return 'protest'
  if (/arrest|detain/.test(w)) return 'arrest'
  if (/explo|blast/.test(w)) return 'explosion'
  if (/ceasefire|truce/.test(w)) return 'ceasefire'
  if (/talk|negotiat|summit|meeting|diplom/.test(w)) return 'talks'
  if (/sanction/.test(w)) return 'sanction'
  if (/cyber|hack/.test(w)) return 'cyber'
  if (/quake|flood|storm|fire|disaster/.test(w)) return 'disaster'
  return 'other'
}
const ROLES = ['attacker', 'target', 'victim', 'claimant', 'mediator', 'participant'] as const
const roleFrom = (r: string): Role => ROLES.find((x) => r.toLowerCase().includes(x)) ?? (/attack|perpetrat|aggress/i.test(r) ? 'attacker' : /victim|killed|injur/i.test(r) ? 'victim' : 'participant')

/** Normalises the model's precision word (it sometimes says "city", "village", "province"). */
export function precisionOf(p: string): Precision {
  const w = p.toLowerCase()
  if (/exact|street|building|base|airport|port|site|village|neighbo/.test(w)) return 'exact'
  if (/town|city|district|municipal/.test(w)) return 'town'
  if (/region|province|oblast|state|governorate|county|area/.test(w)) return 'region'
  if (/country|nation/.test(w)) return 'country'
  return 'town'
}

const KNOWN = new Map(ACTORS.flatMap(([name, , , ...aliases]) => [name, ...aliases].map((a) => [a.toLowerCase(), name] as const)))

const cache = memo<Extraction>(400)

function slot(): boolean {
  const now = Date.now()
  while (calls.length && now - calls[0] > 3600_000) calls.shift()
  if (calls.length >= PER_HOUR) return false
  calls.push(now)
  return true
}

/** Text for an event: headlines of every report plus the body of one readable independent article. */
async function textFor(eventId: string): Promise<string> {
  const reports = edgesOf(eventId, ['reported_by'])
  const heads = [...new Set(reports.flatMap((r) => r.evidence.map((e) => e.quote).filter(Boolean)))].slice(0, 8) as string[]
  let body = ''
  for (const r of reports) {
    const url = r.evidence.find((e) => e.url && /^https?:/.test(e.url))?.url
    if (!url) continue
    body = (await readArticle(url)) ?? ''
    if (body) {
      body = `ARTICLE (${new URL(url).hostname}):\n${body}`
      break
    }
  }
  return [`HEADLINES:\n- ${heads.join('\n- ')}`, body].filter(Boolean).join('\n\n').slice(0, 3500)
}

/** Writes an extraction into the graph (actors and claims replace the rules guesses for this event). */
async function apply(eventId: string, x: Extraction, featureId: string) {
  const e = getEntity(eventId)
  if (!e) return
  const now = Date.now()
  const ev = { featureId, quote: x.summary.slice(0, 200) }
  const kind = kindFrom(x.kind)
  e.subtype = kind
  e.props = { ...e.props, kind, summary: x.summary, casualties: x.casualties ?? e.props.casualties, read: 'llm', readAt: now }
  if (x.place) {
    const g = await geocode(x.place.name, x.place.admin, x.place.country, precisionOf(x.place.precision))
    if (g) {
      const rank = { exact: 4, town: 3, region: 2, country: 1, none: 0 }
      const lid = locationEntity(x.place.name, g.lat, g.lon, g.precision, x.place.country, now)
      link(eventId, 'located_at', lid, { at: now, evidence: ev, confidence: 0.85, via: 'llm' })
      if (rank[g.precision] >= rank[e.precision ?? 'none']) {
        e.position = { lat: g.lat, lon: g.lon }
        e.precision = g.precision
        e.props.placeVia = g.via
      }
    }
  }
  dropEdges(eventId, 'involves', 'rules')
  for (const a of x.actors) {
    const name = KNOWN.get(a.name.toLowerCase()) ?? a.name
    const id = actorId(name)
    if (!getEntity(id)) upsertEntity({ id, type: 'actor', subtype: a.type.toLowerCase().replace(/\s+/g, '-'), label: name, props: {}, firstSeen: now, lastSeen: now, confidence: 0.75 })
    link(eventId, 'involves', id, { role: roleFrom(a.role), at: now, evidence: ev, confidence: 0.8, via: 'llm' })
  }
  for (const c of x.claims) {
    const cid = `claim:${slug(`${eventId}-${c.claimant}-${c.statement}`).slice(0, 90)}`
    const stance = /den|reject/i.test(c.stance) ? 'denies' : 'asserts'
    upsertEntity({ id: cid, type: 'claim', subtype: stance === 'denies' ? 'denial' : 'assertion', label: `${c.claimant}: ${c.statement}`.slice(0, 160), props: { statement: c.statement, stance, claimant: c.claimant }, firstSeen: now, lastSeen: now, confidence: 0.7 })
    link(cid, 'about', eventId, { at: now, evidence: ev, via: 'llm' })
    const name = KNOWN.get(c.claimant.toLowerCase()) ?? c.claimant
    const aid = actorId(name)
    if (!getEntity(aid)) upsertEntity({ id: aid, type: 'actor', subtype: 'org', label: name, props: {}, firstSeen: now, lastSeen: now, confidence: 0.6 })
    link(aid, 'claims', cid, { at: now, evidence: ev, via: 'llm' })
  }
  checkEvent(eventId)
}

/** Reads one event with Claude (analyst request or background queue). Null when disabled, over budget or failed. */
export async function readEvent(eventId: string, opts: { force?: boolean } = {}): Promise<Extraction | null> {
  const e = getEntity(eventId)
  if (!e || e.type !== 'event' || !llmEnabled()) return null
  const sources = e.check?.sources ?? 0
  const last = readAt.get(eventId)
  if (!opts.force && last !== undefined && sources - last < 3) return null
  if (!slot()) return null
  readAt.set(eventId, sources)
  const text = await textFor(eventId)
  const x = await cache(`${eventId}:${sources}`, () => structured({ system: SYSTEM, prompt: text, schema: Extraction, maxTokens: 900 }))
  if (x) await apply(eventId, x, ((e.props.featureIds as string[]) ?? [])[0] ?? eventId)
  return x
}

/** Background: read the best-supported unread events, a few per cycle, within budget. */
export async function readQueue(maxPerCycle = 3) {
  if (!llmEnabled()) return 0
  const candidates = allEntities()
    .filter((e) => e.type === 'event' && e.check && e.check.sources >= 2 && e.subtype !== 'other' && !e.props.read)
    .sort((a, b) => (b.check!.sources - a.check!.sources) || b.lastSeen - a.lastSeen)
    .slice(0, maxPerCycle)
  let n = 0
  for (const e of candidates) if (await readEvent(e.id)) n++
  return n
}

export const extractBudget = () => {
  const now = Date.now()
  return { perHour: PER_HOUR, usedLastHour: calls.filter((t) => now - t < 3600_000).length }
}
