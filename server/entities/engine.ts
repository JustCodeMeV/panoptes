import type { Subgraph } from '../../shared/entities.ts'
import type { Feature } from '../../shared/feature.ts'
import { loadLayer } from '../core/aggregate.ts'
import { streamSource } from '../core/hub.ts'
import type { Provider } from '../core/provider.ts'
import { allEntities, edgesOf, getEntity, prune, stats } from './graph.ts'
import { checkEvent, resolveEvents } from './resolve.ts'
import { ingestReport, reportOf } from './rules.ts'
import { setPhysicalSource, transformsFor } from './transforms.ts'
import { setLayerSource } from './live.ts'
import { extractBudget, readQueue } from './llm.ts'
import { adaptFeature, neighbourhood } from './adapters.ts'

/**
 * ENTITY ENGINE. Every 2 minutes, every new or changed entry of the event
 * layers (news, telegram, conflict log, unrest) is read by the rules
 * extractor, merged into the graph, resolved against known events and
 * checked. The resolved events are served as the `events` layer.
 */

const EVERY_MS = 2 * 60_000
const INPUT_LAYERS = ['news', 'acled', 'unrest', 'telegram', 'cyber', 'osint', 'x']
const PHYSICAL_LAYERS = ['ships', 'military-air', 'gnss', 'infrastructure']

let layers: Record<string, Provider[]> = {}
const seen = new Map<string, string>() // feature id -> signature already ingested
const featureById = new Map<string, Feature>()
let lastRun = 0
let lastMs = 0

async function features(id: string): Promise<Feature[]> {
  const live = streamSource(id)
  if (live) return live.snapshot().features
  const p = layers[id]
  return p ? (await loadLayer(id, p)).features : []
}

const signature = (f: Feature) => `${f.observedAt}|${String(f.props.updatedAt ?? '')}|${String(f.props.items ?? '')}|${String(f.props.verdict ?? '')}`

export async function runOnce(): Promise<number> {
  const t0 = Date.now()
  const touched: string[] = []
  for (const layer of INPUT_LAYERS) {
    for (const f of await features(layer).catch(() => [] as Feature[])) {
      const sig = signature(f)
      if (seen.get(f.id) === sig) continue
      seen.set(f.id, sig)
      featureById.set(f.id, f)
      const r = reportOf(f)
      const id = r && ingestReport(r)
      if (id) touched.push(id)
    }
  }
  const survivors = resolveEvents(touched)
  for (const id of survivors) checkEvent(id)
  lastRun = Date.now()
  lastMs = lastRun - t0
  return touched.length
}

/** Resolved events as map features (layer `events`). */
export function eventFeatures(): Feature[] {
  const out: Feature[] = []
  for (const e of allEntities()) {
    if (e.type !== 'event' || !e.check) continue
    // Untyped one-source items (general news) stay in the graph but off the map.
    if (e.subtype === 'other' && e.check.sources < 3) continue
    const actors = edgesOf(e.id, ['involves']).map((x) => ({ label: getEntity(x.to)?.label ?? x.to, role: x.role }))
    const where = edgesOf(e.id, ['located_at']).map((x) => getEntity(x.to)?.label).filter(Boolean)[0]
    out.push({
      id: `events:${e.id}`,
      layerId: 'events',
      title: e.label,
      ...(e.position ? { position: e.position } : {}),
      geoPrecision: e.position ? 'inferred' : 'none',
      geoBasis: e.position ? `${where ?? 'named place'} (${e.precision} level), read from ${e.check.sources} report(s)` : 'no place named in the reports',
      observedAt: new Date(e.firstSeen).toISOString(),
      source: { provider: 'entity-engine', platform: 'panoptes', retrievedAt: new Date(lastRun).toISOString() },
      tags: ['event', e.subtype, e.check.status],
      props: { kind: e.subtype, entityId: e.id, check: e.check, casualties: e.props.casualties, actors: actors.slice(0, 8), featureIds: e.props.featureIds, sources: e.check.sources, updatedAt: e.lastSeen },
    })
  }
  return out.sort((a, b) => Number(b.props.updatedAt) - Number(a.props.updatedAt)).slice(0, 600)
}

export const engineStats = () => ({ ...stats(), lastRun, lastMs, features: seen.size, ai: extractBudget() })

/** Entities created from one feature (the canvas seed): its event plus direct neighbours. */
export async function seedFor(rawId: string): Promise<Subgraph | null> {
  const featureId = rawId.replace(/^watch:[^:]+:/, '').replace(/^campaigns:/, 'news:')
  const event = allEntities().find((e) => e.type === 'event' && ((e.props.featureIds as string[]) ?? []).includes(featureId))
  if (event) return neighbourhood(event.id)
  // Any other item: find it in its layer and adapt it on demand.
  const layer = featureId.split(':')[0]
  const f = featureById.get(featureId) ?? (await features(layer).catch(() => [] as Feature[])).find((x) => x.id === featureId)
  if (!f) return null
  const id = adaptFeature(f)
  return id ? { ...neighbourhood(id), status: `${f.layerId} item opened as entities` } : null
}

export const entityWithTransforms = (id: string) => {
  const e = getEntity(id)
  return e && { entity: e, transforms: transformsFor(e), degree: edgesOf(id).length }
}

export const featureOf = (id: string) => featureById.get(id)

let started = false
export function startEntityEngine(all: Record<string, Provider[]>) {
  if (started) return
  started = true
  layers = all
  setLayerSource((id) => features(id).catch(() => [] as Feature[]))
  setPhysicalSource(async () => (await Promise.all(PHYSICAL_LAYERS.map((l) => features(l).catch(() => [] as Feature[])))).flat())
  const tick = () =>
    runOnce()
      .then(async (n) => {
        if (n) console.log(`[entities] +${n} reports · ${JSON.stringify(stats())} in ${lastMs} ms`)
        const read = await readQueue()
        if (read) console.log(`[entities] Claude read ${read} event(s) · budget ${JSON.stringify(extractBudget())}`)
      })
      .catch((e) => console.warn(`[entities] ${e instanceof Error ? e.message : String(e)}`))
  setTimeout(tick, 60_000) // let the feeds prime first
  setInterval(tick, EVERY_MS)
  setInterval(() => prune(), 10 * 60_000)
}
