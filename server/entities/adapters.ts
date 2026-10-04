import type { Entity } from '../../shared/entities.ts'
import type { Feature } from '../../shared/feature.ts'
import { centroidOf, countryAt, scoreLocations } from '../geo/gazetteer.ts'
import { allEntities, edgesOf, getEntity, link, slug, upsertEntity } from './graph.ts'
import { checkEvent, resolveEvents } from './resolve.ts'
import { tokens } from '../truth/text.ts'
import { actorId, actorsIn, ingestReport, locationEntity, reportOf, sourceEntity } from './rules.ts'

/**
 * ANY LAYER -> ENTITIES. Event layers go through the rules extractor; every
 * other layer (markets, finance, trends, narratives, physical assets, streams,
 * cyber infrastructure, vulnerabilities, the instability index, countries)
 * maps to typed entities linked to the country they concern, so every item on
 * the map can be a node, clue or piece of evidence in an investigation.
 * Built on demand (when an item is investigated), not on a timer.
 */

const now = () => Date.now()

/** Country location entity for a name or a point. */
export function countryEntity(name: string | undefined): string | undefined {
  if (!name) return undefined
  const pos = centroidOf(name)
  return pos ? locationEntity(name, pos.lat, pos.lon, 'country', name, now()) : undefined
}
const countryOfFeature = (f: Feature) => (f.position ? countryAt(f.position.lat, f.position.lon) : undefined) ?? (typeof f.props.country === 'string' ? f.props.country : undefined)

function asset(f: Feature, subtype: string, extra: Record<string, unknown> = {}): string {
  const id = `asset:${slug(f.id)}`
  const flat = Object.fromEntries(Object.entries(f.props).filter(([, v]) => v !== null && typeof v !== 'object').slice(0, 14))
  upsertEntity({ id, type: 'asset', subtype, label: f.title, props: { ...flat, ...extra, featureId: f.id, url: f.source.url, layer: f.layerId }, ...(f.position ? { position: f.position, precision: f.geoPrecision === 'exact' ? 'exact' : 'town' } : {}), firstSeen: Date.parse(f.observedAt) || now(), lastSeen: now(), confidence: 0.9 })
  const c = countryEntity(countryOfFeature(f))
  if (c) link(id, 'located_at', c, { at: now(), evidence: { featureId: f.id, url: f.source.url }, confidence: 0.8, via: 'transform' })
  return id
}

/** Links an entity to the countries and known actors its text names. */
function mentionsIn(id: string, text: string, f: Feature) {
  const geo = scoreLocations([{ text }])
  const c = countryEntity(geo?.country ?? (geo?.kind === 'country' ? geo.name : undefined))
  if (c) link(id, 'mentions', c, { at: now(), evidence: { featureId: f.id, quote: text.slice(0, 160) }, confidence: 0.6, via: 'transform' })
  for (const a of actorsIn(text)) link(id, 'mentions', a.id, { at: now(), evidence: { featureId: f.id }, confidence: 0.6, via: 'transform' })
}

const PHYSICAL: Record<string, string> = { ships: 'vessel', 'military-air': 'aircraft', satellites: 'satellite', gnss: 'jamming-area', infrastructure: 'infrastructure', frontlines: 'front-line' }

/** A post or item that describes no event (e.g. a channel's statement): a claim by its source. */
function statementOf(f: Feature, domain?: string): string {
  const id = `claim:post-${slug(f.id)}`
  const text = String(f.props.text ?? f.title)
  upsertEntity({ id, type: 'claim', subtype: 'statement', label: f.title, props: { statement: text.slice(0, 600), url: f.source.url, featureId: f.id }, ...(f.position ? { position: f.position, precision: 'town' } : {}), firstSeen: Date.parse(f.observedAt) || now(), lastSeen: now(), confidence: 0.6 })
  if (domain) link(sourceEntity(domain, now()), 'claims', id, { at: now(), evidence: { featureId: f.id, url: f.source.url }, confidence: 0.9, via: 'transform' })
  mentionsIn(id, text.slice(0, 600), f)
  return id
}

const ISSUER_SUBTYPE: Record<string, string> = { government: 'government', 'intl-org': 'intl-org', 'think-tank': 'think-tank' }

/**
 * An official statement or an analysis: a claim made by its issuer (a government,
 * an international body or a think tank), located at the issuer's country, linked to
 * what it mentions and to the events it most likely responds to.
 */
export function publicationOf(f: Feature): string {
  const p = f.props
  const analysis = p.kind === 'analysis'
  const id = `claim:pub-${slug(f.id)}`
  const text = `${f.title}. ${String(p.summary ?? '')}`.slice(0, 700)
  const at = Date.parse(f.observedAt) || now()
  upsertEntity({ id, type: 'claim', subtype: analysis ? 'analysis' : 'official-statement', label: f.title, props: { statement: text, url: f.source.url, featureId: f.id, issuer: p.issuer, own: p.own }, ...(f.position ? { position: f.position, precision: 'country' } : {}), firstSeen: at, lastSeen: now(), confidence: 0.8 })
  const issuer = actorId(String(p.issuer))
  upsertEntity({ id: issuer, type: 'actor', subtype: ISSUER_SUBTYPE[String(p.issuerKind)] ?? 'org', label: String(p.issuer), props: { country: p.issuerCountry, ownership: p.own, note: p.note, domain: p.domain }, firstSeen: at, lastSeen: now(), confidence: 0.95 })
  link(issuer, 'claims', id, { role: 'claimant', at, evidence: { featureId: f.id, url: f.source.url }, confidence: 0.95, via: 'transform' })
  const home = countryEntity(String(p.issuerCountry))
  if (home) {
    link(issuer, 'located_at', home, { at, confidence: 0.9, via: 'transform' })
    // A think tank founded, funded or steered by a government is affiliated with that state
    if (p.issuerKind === 'think-tank' && p.own === 'state') link(issuer, 'affiliated_with', home, { at, evidence: { featureId: f.id, quote: String(p.note ?? 'state-affiliated') }, confidence: 0.8, via: 'transform' })
  }
  mentionsIn(id, text, f)
  respondsTo(id, text, at, String(p.about ?? ''))
  return id
}

/** Links a statement to recent events in the country it is about that share at least two terms with it. */
function respondsTo(claimId: string, text: string, at: number, country: string) {
  if (!country) return
  const mine = new Set(tokens(text))
  let found = 0
  for (const e of allEntities()) {
    if (e.type !== 'event' || Math.abs(e.firstSeen - at) > 2 * 86_400_000) continue
    const where = edgesOf(e.id, ['located_at']).map((x) => getEntity(x.to)).find(Boolean)
    if (!where || (where.label !== country && where.props.country !== country)) continue
    const shared = tokens(e.label).filter((w) => mine.has(w)).length
    if (shared < 2) continue
    link(claimId, 'responds_to', e.id, { at, confidence: Math.min(0.8, 0.3 + shared * 0.1), via: 'transform' })
    if (++found >= 3) return
  }
}

/** Creates (or finds) the entities for one feature of any layer and returns the main entity id. */
export function adaptFeature(f: Feature): string | null {
  // Events: the existing pipeline (rules, resolution, check).
  if (f.layerId === 'events') return getEntity(String(f.props.entityId)) ? String(f.props.entityId) : null
  const r = reportOf(f)
  if (r) {
    const id = ingestReport(r)
    if (!id) return statementOf(f, r.sources[0]?.domain)
    const [kept] = [...resolveEvents([id])]
    checkEvent(kept ?? id)
    return kept ?? id
  }
  if (f.layerId === 'statements' || f.layerId === 'research') return publicationOf(f)
  if (f.layerId === 'atlas' || f.layerId === 'cii') {
    const id = countryEntity(String(f.props.country ?? f.title.split(':')[0]))
    if (id && f.layerId === 'cii') {
      const e = getEntity(id)!
      e.props = { ...e.props, instability: f.props.score, instabilityDrivers: f.props.drivers }
    }
    return id ?? null
  }
  if (f.layerId === 'markets') {
    const id = asset(f, 'market', { probability: f.props.p })
    mentionsIn(id, f.title, f)
    return id
  }
  if (f.layerId === 'finance') return asset(f, 'instrument', { move: f.props.day })
  if (f.layerId === 'trends') return asset(f, 'search-trend', { securityTerms: f.props.securityTerms })
  if (f.layerId === 'livestreams') {
    const id = `source:stream-${slug(f.id)}`
    upsertEntity({ id, type: 'source', subtype: 'stream', label: f.title, props: { url: f.source.url, channel: f.props.channel, featureId: f.id }, ...(f.position ? { position: f.position, precision: 'town' } : {}), firstSeen: now(), lastSeen: now(), confidence: 0.9 })
    const c = countryEntity(countryOfFeature(f))
    if (c) link(id, 'located_at', c, { at: now(), confidence: 0.7, via: 'transform' })
    return id
  }
  if (f.layerId === 'narratives') {
    const id = `claim:narrative-${slug(f.id)}`
    const a = f.props.assessment as { verdict?: string; factChecks?: { publisher: string; title: string; url: string; verdict: string; score: number }[] } | undefined
    upsertEntity({ id, type: 'claim', subtype: 'narrative', label: f.title, props: { statement: f.title, verdict: a?.verdict, featureId: f.id }, firstSeen: Date.parse(f.observedAt) || now(), lastSeen: now(), confidence: 0.7 })
    for (const fc of a?.factChecks ?? []) {
      const cid = `claim:fc-${slug(fc.url)}`
      upsertEntity({ id: cid, type: 'claim', subtype: 'fact-check', label: `${fc.publisher}: ${fc.title}`.slice(0, 160), props: { statement: fc.title, verdict: fc.verdict, url: fc.url }, firstSeen: now(), lastSeen: now(), confidence: fc.score })
      link(cid, fc.verdict === 'true' ? 'supports' : 'contradicts', id, { at: now(), evidence: { featureId: f.id, url: fc.url }, confidence: fc.score, via: 'transform' })
    }
    mentionsIn(id, f.title, f)
    return id
  }
  if (f.layerId === 'cyber' && f.props.kind === 'c2') {
    const id = asset(f, 'c2-server', { malware: f.props.malware })
    const mal = actorId(String(f.props.malware))
    upsertEntity({ id: mal, type: 'actor', subtype: 'threat-actor', label: String(f.props.malware), props: { kind: 'malware family' }, firstSeen: now(), lastSeen: now(), confidence: 0.9 })
    link(id, 'involves', mal, { role: 'participant', at: now(), evidence: { featureId: f.id, url: f.source.url }, confidence: 0.9, via: 'transform' })
    return id
  }
  if (f.layerId === 'cyber' && f.props.kind === 'kev') {
    const id = asset(f, 'vulnerability', { cve: f.props.cve })
    const vendor = actorId(String(f.props.vendor))
    upsertEntity({ id: vendor, type: 'actor', subtype: 'company', label: String(f.props.vendor), props: {}, firstSeen: now(), lastSeen: now(), confidence: 0.9 })
    link(id, 'involves', vendor, { role: 'target', at: now(), evidence: { featureId: f.id, url: f.source.url }, confidence: 0.9, via: 'transform' })
    return id
  }
  if (PHYSICAL[f.layerId]) return asset(f, PHYSICAL[f.layerId])
  // Anything else still becomes something you can link: a generic asset.
  return asset(f, f.layerId)
}

/** Subgraph around an adapted feature: the entity plus its direct relations. */
export function neighbourhood(id: string): { entities: Entity[]; edges: ReturnType<typeof edgesOf> } {
  const es = edgesOf(id)
  const ids = new Set([id, ...es.flatMap((e) => [e.from, e.to])])
  return { entities: [...ids].map((i) => getEntity(i)).filter((e): e is Entity => !!e), edges: es }
}

/** A region or city as a location entity, part_of its region and country (opened from the atlas). */
export function placeEntity(p: { name: string; kind: 'region' | 'city'; lat: number; lon: number; country?: string; region?: string }): string {
  const at = now()
  const id = `location:${slug(p.kind === 'city' ? `${p.name}-${p.country ?? ''}` : `${p.name}-region`)}`
  upsertEntity({ id, type: 'location', subtype: p.kind, label: p.name, props: { country: p.country, region: p.region, kind: p.kind }, position: { lat: p.lat, lon: p.lon }, precision: p.kind === 'city' ? 'town' : 'region', firstSeen: at, lastSeen: at, confidence: 0.95 })
  const c = countryEntity(p.country)
  if (p.kind === 'city' && p.region) {
    const rid = `location:${slug(`${p.region}-region`)}`
    if (!getEntity(rid)) upsertEntity({ id: rid, type: 'location', subtype: 'region', label: p.region, props: { country: p.country, kind: 'region' }, firstSeen: at, lastSeen: at, confidence: 0.9 })
    link(id, 'part_of', rid, { at, confidence: 0.95, via: 'transform' })
    if (c) link(rid, 'part_of', c, { at, confidence: 0.95, via: 'transform' })
  } else if (c) link(id, 'part_of', c, { at, confidence: 0.95, via: 'transform' })
  return id
}
