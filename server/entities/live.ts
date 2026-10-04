import type { Edge, Entity, Subgraph } from '../../shared/entities.ts'
import type { Feature } from '../../shared/feature.ts'
import { blocsOf, BLOCS, displayName, findCountry } from '../atlas/countries.ts'
import { countryAt, centroidOf } from '../geo/gazetteer.ts'
import { pollFeed } from '../news/ingest.ts'
import { loadCorpus, matchFactChecks } from '../truth/factchecks.ts'
import { hash } from '../truth/text.ts'
import { adaptFeature as adapt, countryEntity } from './adapters.ts'
import { socialSearch, type Network } from '../social/apify.ts'
import { edgesOf, getEntity, link, slug, upsertEntity } from './graph.ts'
import { checkEvent, resolveEvents } from './resolve.ts'
import { actorId, ingestReport, locationEntity, type Report } from './rules.ts'

/**
 * LIVE TRANSFORMS: they go and fetch. Results are run through the same rules
 * extractor as everything else, so a news search produces real events,
 * sources and actors linked to the entity it started from.
 */

let layerFeatures: (id: string) => Promise<Feature[]> = async () => []
export const setLayerSource = (fn: (id: string) => Promise<Feature[]>) => (layerFeatures = fn)

const out = (center: string, edges: (Edge | undefined)[], status: string): Subgraph => {
  const es = edges.filter((e): e is Edge => !!e)
  const ids = new Set([center, ...es.flatMap((e) => [e.from, e.to])])
  return { entities: [...ids].map((i) => getEntity(i)).filter((e): e is Entity => !!e), edges: es, status }
}

const countryName = (e: Entity) => (e.type === 'location' && e.precision === 'country' ? e.label : e.type === 'location' && e.props.country ? String(e.props.country) : undefined)

/** Search term for an entity: its name, plus its main alias for actors. */
const termOf = (e: Entity) => (e.type === 'event' ? e.label.split(/[,:;–-]/)[0].slice(0, 80) : e.label.replace(/\s*\(@.*\)$/, ''))

/** Ingests reports, resolves and checks them, and links the resulting events to `center`. */
function ingestAll(center: string, reports: Report[]): { edges: Edge[]; events: number; fresh: number } {
  const ids = reports.map((r) => ingestReport(r)).filter((x): x is string => !!x)
  const before = new Set(ids.filter((i) => edgesOf(i, ['reported_by']).length > 1))
  const kept = [...resolveEvents(ids)]
  const edges: Edge[] = []
  const c = getEntity(center)
  for (const id of kept) {
    checkEvent(id)
    if (id === center) continue
    const ev = getEntity(id)
    const inside = c && countryName(c) && ev?.position && findCountry(countryAt(ev.position.lat, ev.position.lon) ?? '')?.name === findCountry(countryName(c)!)?.name
    const l = link(id, inside ? 'located_at' : 'mentions', center, { at: Date.now(), confidence: 0.6, via: 'transform' })
    if (l) edges.push(l)
  }
  return { edges, events: kept.length, fresh: kept.filter((k) => !before.has(k)).length }
}

export async function newsSearch(e: Entity): Promise<Subgraph> {
  const q = `"${termOf(e)}" when:3d`
  const items = (await pollFeed({ id: `search:${e.id}`, domain: 'news.google.com', url: `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en` }).catch(() => null)) ?? []
  const reports: Report[] = items.slice(0, 15).map((i) => ({ featureId: `search:${hash(i.url)}`, url: i.url, title: i.title, text: `${i.title} ${i.summary}`, at: i.published, sources: [{ domain: i.domain, url: i.url, title: i.title, at: i.published }] }))
  const r = ingestAll(e.id, reports)
  return out(e.id, r.edges, items.length ? `${items.length} articles in the last 3 days → ${r.events} events linked` : `no articles for "${termOf(e)}" in the last 3 days`)
}

export async function telegramMentions(e: Entity): Promise<Subgraph> {
  const names = [e.label, ...((e.props.aliases as string[] | undefined) ?? [])].filter((n) => n.length >= 3).map((n) => n.toLowerCase())
  const posts = (await layerFeatures('telegram')).filter((f) => {
    const t = String(f.props.text ?? f.title).toLowerCase()
    return names.some((n) => t.includes(n))
  })
  const reports: Report[] = posts.slice(0, 25).map((f) => ({ featureId: f.id, url: f.source.url, title: f.title, text: String(f.props.text ?? f.title), at: Date.parse(f.observedAt), position: f.position, sources: [{ domain: `t.me/${String(f.props.handle)}`, url: f.source.url, title: f.title, at: Date.parse(f.observedAt) }] }))
  const r = ingestAll(e.id, reports)
  return out(e.id, r.edges, posts.length ? `${posts.length} Telegram posts in the last 12 h mention it → ${r.events} events` : 'no Telegram post mentions it in the last 12 h')
}

/** Events located in a country (resolved events, conflict log, unrest), by polygon. */
export async function countryEvents(e: Entity): Promise<Subgraph> {
  const name = countryName(e)
  if (!name) return out(e.id, [], 'not a country')
  const target = findCountry(name)?.name
  const inC = (f: Feature) => !!f.position && findCountry(countryAt(f.position.lat, f.position.lon) ?? '')?.name === target
  const feats = [...(await layerFeatures('events')), ...(await layerFeatures('acled')), ...(await layerFeatures('unrest'))].filter(inC)
  const edges: Edge[] = []
  for (const f of feats.slice(0, 40)) {
    const eid = f.layerId === 'events' ? String(f.props.entityId) : `event:${slug(f.id)}`
    if (!getEntity(eid)) continue
    edges.push(link(eid, 'located_at', e.id, { at: Date.parse(f.observedAt) || Date.now(), confidence: 0.8, via: 'transform' })!)
  }
  return out(e.id, edges, feats.length ? `${feats.length} events and reports inside ${name} right now` : `nothing reported inside ${name} in the live layers`)
}

export async function wikipediaProfile(e: Entity): Promise<Subgraph> {
  const title = termOf(e).replace(/ /g, '_')
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { 'user-agent': 'panoptes-research/0.1' }, signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!r || !r.ok) return out(e.id, [], `no Wikipedia article titled "${termOf(e)}"`)
  const j = (await r.json()) as { extract?: string; description?: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } }
  e.props = { ...e.props, description: j.description, about: j.extract?.slice(0, 600), image: j.thumbnail?.source, url: j.content_urls?.desktop?.page ?? e.props.url }
  return out(e.id, [], `Wikipedia: ${j.description ?? 'profile added'}`)
}

const country = (e: Entity) => findCountry(countryName(e) ?? e.label)

function countryLoc(name: string): string | undefined {
  const pos = centroidOf(name)
  return pos ? locationEntity(name, pos.lat, pos.lon, 'country', name, Date.now()) : undefined
}

export function leaders(e: Entity): Subgraph {
  const c = country(e)
  if (!c) return out(e.id, [], 'not a country')
  const edges: Edge[] = []
  for (const [role, txt] of [['chief of state', c.chiefOfState], ['head of government', c.headOfGovernment]] as const) {
    if (!txt) continue
    const person = txt.match(/([A-Z][a-z'-]+(?:\s+[a-z]{1,3})?\s+(?:al-|bin\s+)?[A-Z][A-Z'-]{2,}(?:\s+[A-Z][A-Z'-]+)*)/)?.[1] ?? txt.split(' (')[0]
    const label = person.replace(/\b([A-Z])([A-Z'-]+)\b/g, (_, a, b) => a + b.toLowerCase())
    const id = actorId(label)
    upsertEntity({ id, type: 'actor', subtype: 'person', label, props: { title: txt, country: c.name, role }, firstSeen: Date.now(), lastSeen: Date.now(), confidence: 0.9 })
    edges.push(link(id, 'leads', e.id, { at: Date.now(), evidence: { featureId: 'factbook', quote: `${role}: ${txt}` }, confidence: 0.9, via: 'transform' })!)
  }
  return out(e.id, edges, edges.length ? `${edges.length} leaders (CIA World Factbook)` : 'no executive listed')
}

export function alliances(e: Entity): Subgraph {
  const c = country(e)
  if (!c) return out(e.id, [], 'not a country')
  const edges = blocsOf(c).map((b) => {
    const id = `actor:bloc-${slug(b)}`
    upsertEntity({ id, type: 'actor', subtype: 'org', label: BLOCS[b], props: { bloc: b }, firstSeen: Date.now(), lastSeen: Date.now(), confidence: 1 })
    return link(e.id, 'member_of', id, { at: Date.now(), evidence: { featureId: 'factbook' }, confidence: 1, via: 'transform' })
  })
  return out(e.id, edges, `${edges.length} alliances and blocs (of ${c.organizations.length} memberships)`)
}

export function neighbours(e: Entity): Subgraph {
  const c = country(e)
  if (!c) return out(e.id, [], 'not a country')
  const edges = c.borders.map((b) => {
    const id = countryLoc(displayName(findCountry(b.name)?.name ?? b.name))
    return id ? link(e.id, 'borders', id, { at: Date.now(), evidence: { featureId: 'factbook', quote: `${b.km} km border` }, confidence: 1, via: 'transform' }) : undefined
  })
  return out(e.id, edges, c.borders.length ? `${c.borders.length} land neighbours` : 'no land borders (island state)')
}

export function trade(e: Entity): Subgraph {
  const c = country(e)
  if (!c) return out(e.id, [], 'not a country')
  const edges: (Edge | undefined)[] = []
  for (const [list, way] of [[c.exportPartners, 'exports'], [c.importPartners, 'imports']] as const)
    for (const p of list) {
      const id = countryLoc(displayName(findCountry(p.name)?.name ?? p.name))
      if (id) edges.push(link(e.id, 'trades_with', id, { at: Date.now(), evidence: { featureId: `factbook-${way}`, quote: `${way} ${p.share}%` }, confidence: p.share / 30, via: 'transform' }))
    }
  return out(e.id, edges, `top partners: exports ${c.exportPartners.map((p) => `${p.name} ${p.share}%`).join(', ') || '–'}; imports ${c.importPartners.map((p) => `${p.name} ${p.share}%`).join(', ') || '–'}`)
}

export async function predictionMarkets(e: Entity): Promise<Subgraph> {
  const term = termOf(e).toLowerCase()
  const ms = (await layerFeatures('markets')).filter((m) => m.title.toLowerCase().includes(term)).slice(0, 12)
  const edges = ms.map((m) => {
    const id = `asset:${slug(m.id)}`
    upsertEntity({ id, type: 'asset', subtype: 'market', label: `${m.title} · ${Math.round(Number(m.props.p) * 100)}%`, props: { featureId: m.id, p: m.props.p, platform: m.props.platform, url: m.source.url }, firstSeen: Date.now(), lastSeen: Date.now(), confidence: 1 })
    return link(id, 'mentions', e.id, { at: Date.now(), evidence: { featureId: m.id, url: m.source.url }, confidence: 0.7, via: 'transform' })
  })
  return out(e.id, edges, ms.length ? `${ms.length} prediction markets ask about it` : 'no prediction market asks about it')
}

export async function factChecks(e: Entity): Promise<Subgraph> {
  const corpus = await loadCorpus().catch(() => null)
  if (!corpus) return out(e.id, [], 'fact-check feeds unavailable')
  const text = e.type === 'claim' ? String(e.props.statement ?? e.label) : e.label
  const ms = matchFactChecks(corpus, text, 5)
  const edges = ms.map((m) => {
    const id = `claim:fc-${hash(m.url)}`
    upsertEntity({ id, type: 'claim', subtype: 'fact-check', label: `${m.publisher}: ${m.title}`.slice(0, 160), props: { statement: m.title, verdict: m.verdict, url: m.url, score: m.score }, firstSeen: Date.now(), lastSeen: Date.now(), confidence: m.score })
    return link(id, m.verdict === 'true' ? 'supports' : m.verdict === 'false' || m.verdict === 'misleading' ? 'contradicts' : 'about', e.id, { at: Date.now(), evidence: { featureId: 'factcheck', url: m.url }, confidence: m.score, via: 'transform' })
  })
  return out(e.id, edges, ms.length ? `${ms.length} published fact-checks match (best ${Math.round(ms[0].score * 100)}% term match)` : 'no published fact-check matches')
}

export async function sourceItems(e: Entity): Promise<Subgraph> {
  const domain = String(e.props.domain ?? '').toLowerCase()
  if (!domain) return out(e.id, [], 'not a source')
  const feats = [...(await layerFeatures('news')), ...(await layerFeatures('telegram'))].filter((f) => {
    if (domain.startsWith('t.me/')) return `t.me/${String(f.props.handle ?? '').toLowerCase()}` === domain
    const tl = (f.props.assessment as { campaign?: { timeline?: { source: string }[] } } | undefined)?.campaign?.timeline ?? []
    return tl.some((t) => t.source.toLowerCase() === domain) || f.source.platform.toLowerCase() === domain
  })
  const edges: Edge[] = []
  for (const f of feats.slice(0, 30)) {
    const ev = [...edgesOf(e.id, ['reported_by'])].find((x) => ((getEntity(x.from)?.props.featureIds as string[]) ?? []).includes(f.id))
    if (ev) edges.push(ev)
  }
  return out(e.id, edges, feats.length ? `${feats.length} items from this source in the live layers` : 'nothing from this source in the live layers right now')
}

// ---------- cross-layer transforms ----------


/** The country an entity is in (by position, or its stated country). */
export function countryOfEntity(e: Entity): Subgraph {
  const name = e.position ? countryAt(e.position.lat, e.position.lon) : typeof e.props.country === 'string' ? e.props.country : undefined
  const c = countryEntity(name)
  if (!c || c === e.id) return out(e.id, [], 'no country known for it')
  return out(e.id, [link(e.id, 'located_at', c, { at: Date.now(), confidence: 0.8, via: 'transform' })], `in ${name}`)
}

/** Cyber incidents (ransomware claims, botnet servers) in a country. */
export async function cyberInCountry(e: Entity): Promise<Subgraph> {
  const name = countryName(e)
  if (!name) return out(e.id, [], 'not a country')
  const target = findCountry(name)?.name
  const fs = (await layerFeatures('cyber')).filter((f) => findCountry(String(f.props.country ?? ''))?.name === target)
  const edges: (Edge | undefined)[] = []
  for (const f of fs.slice(0, 30)) {
    const id = adapt(f)
    if (id) edges.push(link(id, 'located_at', e.id, { at: Date.now(), evidence: { featureId: f.id, url: f.source.url }, confidence: 0.8, via: 'transform' }))
  }
  return out(e.id, edges, fs.length ? `${fs.length} cyber incidents and botnet servers in ${name}` : `no ransomware claim or botnet server in ${name} right now`)
}

/** A threat actor's victims and infrastructure from the cyber layer. */
export async function threatActorActivity(e: Entity): Promise<Subgraph> {
  const name = e.label.toLowerCase()
  const fs = (await layerFeatures('cyber')).filter((f) => String(f.props.group ?? f.props.malware ?? '').toLowerCase() === name)
  const ids = fs.slice(0, 30).map((f) => adapt(f)).filter((x): x is string => !!x)
  const edges = ids.flatMap((id) => edgesOf(id, ['involves']).filter((x) => x.to === e.id || x.from === e.id))
  return out(e.id, edges, fs.length ? `${fs.length} victims / servers attributed to ${e.label} in the live feeds` : `nothing attributed to ${e.label} in the live cyber feeds`)
}

/** Items from other layers that share distinctive words with this entity (stories, posts, markets). */
export async function relatedAcrossLayers(e: Entity): Promise<Subgraph> {
  const words = e.label.toLowerCase().match(/[a-z\u00c0-\u024f]{5,}/g)?.filter((w) => !['about', 'after', 'their', 'there', 'which', 'would', 'could', 'reports', 'claims'].includes(w)) ?? []
  if (!words.length) return out(e.id, [], 'name too generic to match')
  const layers = ['news', 'telegram', 'markets', 'cyber', 'osint', 'narratives']
  const found: Feature[] = []
  for (const l of layers)
    for (const f of await layerFeatures(l)) {
      const t = f.title.toLowerCase()
      if (words.filter((w) => t.includes(w)).length >= Math.min(2, words.length)) found.push(f)
    }
  const edges: (Edge | undefined)[] = []
  for (const f of found.slice(0, 25)) {
    const id = adapt(f)
    if (id && id !== e.id) edges.push(link(id, 'mentions', e.id, { at: Date.now(), evidence: { featureId: f.id, url: f.source.url, quote: f.title.slice(0, 160) }, confidence: 0.5, via: 'transform' }))
  }
  return out(e.id, edges, found.length ? `${found.length} related items across news, Telegram, markets, cyber, OSINT` : 'no related item in the other layers')
}

// ---------- social networks via Apify (on demand, budgeted) ----------


export async function socialTransform(e: Entity, network: Network): Promise<Subgraph> {
  const { posts, status } = await socialSearch(network, termOf(e))
  const reports: Report[] = posts.map((p) => ({
    featureId: `${network}:${hash(p.url)}`, url: p.url, title: p.text.slice(0, 180) || `${network} post by @${p.author}`, text: p.text, at: p.at,
    sources: [{ domain: `${network}:@${p.author}`, url: p.url, title: p.text.slice(0, 120), at: p.at }],
  }))
  const r = ingestAll(e.id, reports)
  return out(e.id, r.edges, status)
}

// ---------- publications, warnings, humanitarian (layers statements / research / warnings / humanitarian) ----------

/** Adapts the matching items of some layers and links each to the entity. */
async function fromLayers(e: Entity, layers: string[], pick: (f: Feature) => boolean, rel: Edge['rel'], what: string, max = 25): Promise<Subgraph> {
  const feats = (await Promise.all(layers.map((l) => layerFeatures(l)))).flat().filter(pick)
  const edges: (Edge | undefined)[] = []
  for (const f of feats.slice(0, max)) {
    const id = adapt(f)
    if (id && id !== e.id) edges.push(link(id, rel, e.id, { at: Date.parse(f.observedAt) || Date.now(), evidence: { featureId: f.id, url: f.source.url }, confidence: 0.7, via: 'transform' }))
  }
  const more = feats.length > max ? ` (showing ${max})` : ''
  return out(e.id, edges, feats.length ? `${feats.length} ${what}${more}` : `no ${what} in the live layers`)
}

const mentions = (f: Feature, name: string) => f.props.about === name || f.props.country === name || new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(`${f.title} ${String(f.props.summary ?? '')}`)
const inCountry = (f: Feature, name: string) => f.props.country === name || (!!f.position && countryAt(f.position.lat, f.position.lon) === name) || mentions(f, name)

export async function statementsAbout(e: Entity, layer: 'statements' | 'research'): Promise<Subgraph> {
  const name = countryName(e) ?? e.label
  return fromLayers(e, [layer], (f) => mentions(f, name), 'mentions', layer === 'statements' ? `official statements about ${name}` : `analyses about ${name}`)
}

export async function warningsNear(e: Entity): Promise<Subgraph> {
  const name = countryName(e)
  const pos = e.position
  const near = (f: Feature) => (name ? inCountry(f, name) : !!pos && !!f.position && Math.hypot(f.position.lat - pos.lat, (f.position.lon - pos.lon) * Math.cos((pos.lat * Math.PI) / 180)) < 4)
  return fromLayers(e, ['warnings'], near, 'near', `maritime and air warnings ${name ? `for ${name}` : 'within ~400 km'}`)
}

export async function humanitarianIn(e: Entity): Promise<Subgraph> {
  const name = countryName(e) ?? e.label
  return fromLayers(e, ['humanitarian'], (f) => inCountry(f, name), 'located_at', `humanitarian and health reports for ${name}`)
}

/** Official statements and analyses that respond to an event: same country, within 48 h, shared terms. */
export async function reactions(e: Entity): Promise<Subgraph> {
  const where = edgesOf(e.id, ['located_at']).map((x) => getEntity(x.to)).find(Boolean)
  const name = where ? (where.precision === 'country' ? where.label : String(where.props.country ?? where.label)) : undefined
  if (name) {
    const feats = [...(await layerFeatures('statements')), ...(await layerFeatures('research'))].filter((f) => mentions(f, name) && Math.abs((Date.parse(f.observedAt) || 0) - e.firstSeen) < 2 * 86_400_000)
    for (const f of feats.slice(0, 30)) adapt(f) // links `responds_to` when terms overlap
  }
  const es = edgesOf(e.id, ['responds_to']).filter((x) => x.to === e.id)
  return out(e.id, es, es.length ? `${es.length} official reactions and analyses` : `no statement or analysis found that responds to it${name ? ` (searched ${name}, ±48 h)` : ''}`)
}

/** Everything an issuer (government body, international organisation, think tank) published recently. */
export async function issuerPublications(e: Entity): Promise<Subgraph> {
  const sub = await fromLayers(e, ['statements', 'research'], (f) => f.props.issuer === e.label, 'about', `publications by ${e.label}`)
  // The links above point claim -> issuer as "about"; the true relation is the issuer claiming them.
  const edges = edgesOf(e.id, ['claims']).filter((x) => x.from === e.id)
  return { ...out(e.id, edges, sub.status ?? ''), entities: sub.entities }
}

export function affiliation(e: Entity): Subgraph {
  const es = edgesOf(e.id, ['affiliated_with', 'located_at']).filter((x) => x.from === e.id)
  const own = e.props.ownership ? `${String(e.props.ownership)}${e.props.note ? `: ${String(e.props.note)}` : ''}` : 'no ownership on record'
  return out(e.id, es, own)
}
