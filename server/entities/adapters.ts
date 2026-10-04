import type { Entity } from '../../shared/entities.ts'
import type { Feature } from '../../shared/feature.ts'
import { centroidOf, countryAt, scoreLocations } from '../geo/gazetteer.ts'
import { edgesOf, getEntity, link, slug, upsertEntity } from './graph.ts'
import { checkEvent, resolveEvents } from './resolve.ts'
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
