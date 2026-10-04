import type { Edge, Entity, Rel, Subgraph, TransformDef } from '../../shared/entities.ts'
import type { Feature } from '../../shared/feature.ts'
import { allEntities, edgesOf, getEntity, link, slug, upsertEntity } from './graph.ts'
import { km } from './resolve.ts'
import * as live from './live.ts'

/**
 * TRANSFORMS (Maltego-style): each takes one entity and returns the part of
 * the graph it expands into. Most walk existing relations; "nearby" ones
 * search by distance and time, and "assets nearby" pulls ships, aircraft,
 * jamming cells and infrastructure from the physical layers on demand.
 */

export const TRANSFORMS: TransformDef[] = [
  // live: these go and fetch
  { id: 'news-search', label: '⚡ Search news now (3 days)', types: ['event', 'actor', 'location', 'source'] },
  { id: 'telegram-mentions', label: '⚡ Telegram mentions (12 h)', types: ['event', 'actor', 'location'] },
  { id: 'country-events', label: '⚡ Events inside this country now', types: ['location'] },
  { id: 'leaders', label: '⚡ Leaders and government', types: ['location'] },
  { id: 'alliances', label: '⚡ Alliances and blocs', types: ['location'] },
  { id: 'neighbours', label: '⚡ Neighbours (land borders)', types: ['location'] },
  { id: 'trade', label: '⚡ Trade partners', types: ['location'] },
  { id: 'wikipedia', label: '⚡ Profile (Wikipedia)', types: ['actor', 'location', 'source'] },
  { id: 'markets', label: '⚡ Prediction markets on it', types: ['actor', 'location', 'event'] },
  { id: 'fact-checks', label: '⚡ Published fact-checks', types: ['claim', 'event'] },
  { id: 'source-items', label: '⚡ Recent items from this source', types: ['source'] },
  // graph: walk what is already known
  { id: 'sources', label: 'Who reported it', types: ['event'] },
  { id: 'actors', label: 'Actors involved', types: ['event'] },
  { id: 'claims', label: 'Claims about it', types: ['event'] },
  { id: 'location', label: 'Where', types: ['event'] },
  { id: 'nearby-events', label: 'Events within 50 km / 24 h', types: ['event', 'location', 'asset'] },
  { id: 'nearby-assets', label: 'Ships, aircraft, jamming, infrastructure nearby', types: ['event', 'location'] },
  { id: 'events', label: 'Events involving / reported / located here', types: ['actor', 'source', 'location'] },
  { id: 'co-actors', label: 'Actors in the same events', types: ['actor'] },
  { id: 'reporters', label: 'Sources that report on it', types: ['actor'] },
  { id: 'source-claims', label: 'Claims it made', types: ['source', 'actor'] },
  { id: 'peers', label: 'Same-government or copying sources', types: ['source'] },
  { id: 'claim-context', label: 'Event, claimant and counter-claims', types: ['claim'] },
]

const sub = (center: string, es: Edge[]): Subgraph => {
  const ids = new Set([center, ...es.flatMap((e) => [e.from, e.to])])
  return { entities: [...ids].map((i) => getEntity(i)).filter((e): e is Entity => !!e), edges: es }
}
const out = (id: string, rel: Rel) => edgesOf(id, [rel]).filter((e) => e.from === id)
const inc = (id: string, rel: Rel) => edgesOf(id, [rel]).filter((e) => e.to === id)

/** Physical-layer features for the asset transform (injected by the engine to avoid import cycles). */
let physical: () => Promise<Feature[]> = async () => []
export const setPhysicalSource = (fn: () => Promise<Feature[]>) => (physical = fn)

const ASSET_LAYERS: Record<string, { subtype: string; radius: number }> = {
  ships: { subtype: 'vessel', radius: 80 },
  'military-air': { subtype: 'aircraft', radius: 150 },
  gnss: { subtype: 'jamming-area', radius: 60 },
  infrastructure: { subtype: 'infrastructure', radius: 60 },
}

function nearbyEvents(e: Entity): Subgraph {
  if (!e.position) return { entities: [e], edges: [] }
  const es: Edge[] = []
  for (const o of allEntities()) {
    if (o.type !== 'event' || o.id === e.id || !o.position) continue
    if (e.type === 'event' && Math.abs(o.firstSeen - e.firstSeen) > 24 * 3600_000) continue
    const d = km(e.position, o.position)
    if (d > 50) continue
    const l = link(e.id, 'near', o.id, { at: Math.max(e.lastSeen, o.lastSeen), confidence: 1 - d / 60, via: 'transform' })
    if (l) es.push(l)
  }
  return sub(e.id, es.slice(0, 25))
}

async function nearbyAssets(e: Entity): Promise<Subgraph> {
  if (!e.position) return { entities: [e], edges: [] }
  const es: Edge[] = []
  for (const f of await physical()) {
    const spec = ASSET_LAYERS[f.layerId]
    if (!spec) continue
    const p = f.position ?? (f.geometry?.type === 'Polygon' ? { lon: f.geometry.coordinates[0][0][0], lat: f.geometry.coordinates[0][0][1] } : undefined)
    if (!p) continue
    const d = km(e.position, p)
    if (d > spec.radius) continue
    const id = `asset:${slug(f.id)}`
    upsertEntity({
      id, type: 'asset', subtype: spec.subtype, label: f.title, position: p, precision: 'exact',
      props: { featureId: f.id, layer: f.layerId, km: Math.round(d), ...Object.fromEntries(Object.entries(f.props).filter(([, v]) => typeof v !== 'object').slice(0, 10)) },
      firstSeen: Date.parse(f.observedAt) || Date.now(), lastSeen: Date.now(), confidence: 1,
    })
    const l = link(e.id, 'near', id, { at: Date.now(), evidence: { featureId: f.id, url: f.source.url }, confidence: 1 - d / (spec.radius * 1.2), via: 'transform' })
    if (l) es.push(l)
    if (es.length >= 30) break
  }
  return sub(e.id, es)
}

export async function runTransform(id: string, name: string): Promise<Subgraph | null> {
  const g = await run(id, name)
  if (!g || g.status) return g
  const n = g.edges.length
  return { ...g, status: n ? `${n} relation${n === 1 ? '' : 's'} found` : 'nothing linked yet: try a ⚡ live transform such as "Search news now"' }
}

async function run(id: string, name: string): Promise<Subgraph | null> {
  const e = getEntity(id)
  if (!e) return null
  switch (name) {
    case 'news-search': return live.newsSearch(e)
    case 'telegram-mentions': return live.telegramMentions(e)
    case 'country-events': return live.countryEvents(e)
    case 'leaders': return live.leaders(e)
    case 'alliances': return live.alliances(e)
    case 'neighbours': return live.neighbours(e)
    case 'trade': return live.trade(e)
    case 'wikipedia': return live.wikipediaProfile(e)
    case 'markets': return live.predictionMarkets(e)
    case 'fact-checks': return live.factChecks(e)
    case 'source-items': return live.sourceItems(e)
    case 'sources': return sub(id, out(id, 'reported_by'))
    case 'actors': return sub(id, out(id, 'involves'))
    case 'claims': return sub(id, inc(id, 'about'))
    case 'location': return sub(id, out(id, 'located_at'))
    case 'nearby-events': return nearbyEvents(e)
    case 'nearby-assets': return nearbyAssets(e)
    case 'events':
      return sub(id, e.type === 'actor' ? inc(id, 'involves') : e.type === 'source' ? inc(id, 'reported_by').slice(0, 40) : inc(id, 'located_at'))
    case 'co-actors': {
      const es: Edge[] = []
      for (const ev of inc(id, 'involves')) for (const o of out(ev.from, 'involves')) if (o.to !== id) es.push(ev, o)
      return sub(id, [...new Set(es)].slice(0, 60))
    }
    case 'reporters': {
      const es: Edge[] = []
      for (const ev of inc(id, 'involves').slice(0, 15)) es.push(ev, ...out(ev.from, 'reported_by').slice(0, 4))
      return sub(id, es)
    }
    case 'source-claims': return sub(id, out(id, 'claims'))
    case 'peers': {
      // Sources of the same government (any country), or that copy / forward this one.
      const me = e.props
      const es: Edge[] = [...edgesOf(id, ['copies', 'forwards'])]
      if (me.ownership === 'state' && me.country) {
        for (const o of allEntities()) {
          if (o.type !== 'source' || o.id === id || o.props.ownership !== 'state' || o.props.country !== me.country) continue
          const l = link(id, 'same_as', o.id, { at: Date.now(), confidence: 0.5, via: 'transform' })
          if (l) es.push(l)
        }
      }
      return sub(id, es.slice(0, 30))
    }
    case 'claim-context': {
      const about = out(id, 'about')
      const es: Edge[] = [...about, ...inc(id, 'claims')]
      for (const a of about) for (const other of inc(a.to, 'about')) if (other.from !== id) es.push(other, ...inc(other.from, 'claims'))
      return sub(id, es)
    }
  }
  return null
}

const COUNTRY_ONLY = new Set(['country-events', 'leaders', 'alliances', 'neighbours', 'trade'])
const isCountry = (e: Entity) => e.type === 'location' && e.precision === 'country'
export const transformsFor = (e: Entity) =>
  TRANSFORMS.filter((t) => t.types.includes(e.type) && (!COUNTRY_ONLY.has(t.id) || isCountry(e)) && !(isCountry(e) && ['nearby-events', 'nearby-assets'].includes(t.id)))
