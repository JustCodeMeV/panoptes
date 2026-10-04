import type { Edge, Entity, Evidence, Rel, Subgraph } from '../../shared/entities.ts'

/**
 * In-memory entity graph. Rebuilt from live data after a restart (Render's
 * disk is wiped on deploy); investigations are kept by saving a snapshot to
 * the case file. Entities and edges older than WINDOW_MS are pruned.
 */

const WINDOW_MS = 48 * 3600_000
const MAX_EVIDENCE = 12

const entities = new Map<string, Entity>()
const edges = new Map<string, Edge>()
const adj = new Map<string, Set<string>>() // entity id -> edge ids

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)

/** Inserts or merges an entity (later sightings widen the time span and keep the best position). */
export function upsertEntity(e: Entity): Entity {
  const prev = entities.get(e.id)
  if (!prev) {
    entities.set(e.id, e)
    return e
  }
  prev.firstSeen = Math.min(prev.firstSeen, e.firstSeen)
  prev.lastSeen = Math.max(prev.lastSeen, e.lastSeen)
  prev.confidence = Math.max(prev.confidence, e.confidence)
  prev.props = { ...prev.props, ...e.props }
  const rank = { exact: 4, town: 3, region: 2, country: 1, none: 0 }
  if (e.position && (!prev.position || rank[e.precision ?? 'none'] > rank[prev.precision ?? 'none'])) {
    prev.position = e.position
    prev.precision = e.precision
  }
  if (e.check) prev.check = e.check
  return prev
}

const edgeId = (from: string, rel: Rel, to: string, role?: string) => `${from}|${rel}${role ? `:${role}` : ''}|${to}`

/** Inserts an edge or adds evidence to the existing one. */
export function link(from: string, rel: Rel, to: string, opts: { role?: Edge['role']; at: number; evidence?: Evidence; confidence?: number; via?: Edge['via'] }): Edge | undefined {
  if (from === to || !entities.has(from) || !entities.has(to)) return undefined
  const id = edgeId(from, rel, to, opts.role)
  let e = edges.get(id)
  if (!e) {
    e = { id, from, to, rel, role: opts.role, at: opts.at, evidence: [], confidence: opts.confidence ?? 0.6, via: opts.via ?? 'rules' }
    edges.set(id, e)
    for (const n of [from, to]) {
      const s = adj.get(n) ?? new Set()
      s.add(id)
      adj.set(n, s)
    }
  } else {
    e.at = Math.max(e.at, opts.at)
    e.confidence = Math.max(e.confidence, opts.confidence ?? 0)
    if (opts.via === 'llm') e.via = 'llm'
  }
  if (opts.evidence && !e.evidence.some((x) => x.featureId === opts.evidence!.featureId) && e.evidence.length < MAX_EVIDENCE) e.evidence.push(opts.evidence)
  return e
}

export const getEntity = (id: string) => entities.get(id)
export const allEntities = () => [...entities.values()]
export const allEdges = () => [...edges.values()]

/** Edges touching an entity, optionally filtered by relation. */
export function edgesOf(id: string, rels?: Rel[]): Edge[] {
  const out: Edge[] = []
  for (const eid of adj.get(id) ?? []) {
    const e = edges.get(eid)
    if (e && (!rels || rels.includes(e.rel))) out.push(e)
  }
  return out
}

/** Neighbouring entities over the given relations (both directions). */
export function neighbors(id: string, rels?: Rel[]): Subgraph {
  const es = edgesOf(id, rels)
  const ids = new Set(es.flatMap((e) => [e.from, e.to]))
  ids.add(id)
  return { entities: [...ids].map((x) => entities.get(x)!).filter(Boolean), edges: es }
}

/** Moves every edge of `from` onto `into` and deletes `from` (entity resolution). */
export function mergeInto(from: string, into: string) {
  if (from === into || !entities.has(from) || !entities.has(into)) return
  const a = entities.get(from)!
  upsertEntity({ ...a, id: into })
  for (const e of edgesOf(from)) {
    const src = e.from === from ? into : e.from
    const dst = e.to === from ? into : e.to
    deleteEdge(e.id)
    for (const ev of e.evidence) link(src, e.rel, dst, { role: e.role, at: e.at, evidence: ev, confidence: e.confidence, via: e.via })
    if (!e.evidence.length) link(src, e.rel, dst, { role: e.role, at: e.at, confidence: e.confidence, via: e.via })
  }
  entities.delete(from)
  adj.delete(from)
}

function deleteEdge(id: string) {
  const e = edges.get(id)
  if (!e) return
  edges.delete(id)
  adj.get(e.from)?.delete(id)
  adj.get(e.to)?.delete(id)
}

export function search(q: string, limit = 20): Entity[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  return allEntities()
    .filter((e) => e.label.toLowerCase().includes(s) || (e.props.aliases as string[] | undefined)?.some((a) => a.toLowerCase().includes(s)))
    .sort((a, b) => edgesOf(b.id).length - edgesOf(a.id).length)
    .slice(0, limit)
}

export function prune(now = Date.now()) {
  const cut = now - WINDOW_MS
  for (const [id, e] of edges) if (e.at < cut) deleteEdge(id)
  for (const [id, e] of entities) if (e.lastSeen < cut || (e.type !== 'source' && e.type !== 'actor' && !adj.get(id)?.size)) {
    for (const eid of adj.get(id) ?? []) deleteEdge(eid)
    entities.delete(id)
    adj.delete(id)
  }
}

export const stats = () => {
  const by: Record<string, number> = {}
  for (const e of entities.values()) by[e.type] = (by[e.type] ?? 0) + 1
  return { entities: entities.size, edges: edges.size, byType: by }
}

/** Test seam. */
export function clearGraph() {
  entities.clear()
  edges.clear()
  adj.clear()
}
