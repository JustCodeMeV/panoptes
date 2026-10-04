import type { Feature, LayerResponse } from '../../shared/feature.ts'
import type { LiveEvent } from '../../shared/live.ts'
import { loadLayer } from '../core/aggregate.ts'
import { eventsPerMin, publish, registerStream, streamSource, subscribe } from '../core/hub.ts'
import type { Provider } from '../core/provider.ts'
import { listWatches, type WatchRow } from '../cases/db.ts'

/**
 * Region watch: analyst-drawn circles. Every feature from every layer that
 * lands inside one becomes an alert on the `watch` stream, so the live wire,
 * panel, globe and case file handle alerts like any other layer.
 * What is already inside a region when the watch is created is a silent
 * baseline (listed, not announced); only later arrivals and changes fire.
 */
export const LAYER_ID = 'watch'
const MAX_ALERTS = 300
const STREAMS = ['news', 'markets']
/** Layers a watch covers when it names none: churny or static layers (livestreams, frontlines) would only add noise. */
export const DEFAULT_LAYERS = ['news', 'telegram', 'campaigns', 'markets', 'unrest', 'acled', 'osint', 'narratives', 'gnss', 'military-air']

const R = 6371
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Which watches a feature falls into (layer filter: empty = all layers). */
/** High-volume layers alert only on what an analyst would want pushed: Telegram from official/newsroom channels or coordinated copies. */
const alertWorthy = (f: Feature) => f.layerId !== 'telegram' || Number(f.props.tier) <= 2 || f.tags.includes('coordinated')

export function matchWatches(f: Feature, watches: WatchRow[]): { watch: WatchRow; km: number }[] {
  if (!f.position || f.layerId === LAYER_ID || !alertWorthy(f)) return []
  const out: { watch: WatchRow; km: number }[] = []
  for (const w of watches) {
    if (!(w.layers.length ? w.layers : DEFAULT_LAYERS).includes(f.layerId)) continue
    const km = haversineKm(f.position, w)
    if (km <= w.radiusKm) out.push({ watch: w, km })
  }
  return out
}

const alerts = new Map<string, Feature>()
let watches: WatchRow[] = []

export function toAlert(f: Feature, w: WatchRow, km: number, change?: string): Feature {
  return {
    ...f,
    id: `watch:${w.id}:${f.id}`,
    layerId: LAYER_ID,
    tags: [...f.tags, 'watch'],
    props: { ...f.props, originLayer: f.layerId, originId: f.id, watchId: w.id, watchName: w.name, km: Math.round(km), change, alertedAt: Date.now() },
  }
}

function trim() {
  while (alerts.size > MAX_ALERTS) alerts.delete(alerts.keys().next().value!)
}

/** Feed one feature through the watches. `silent` = record without announcing (baseline). */
export function consider(f: Feature, opts: { silent?: boolean; kind?: 'new' | 'update'; change?: string } = {}) {
  for (const { watch, km } of matchWatches(f, watches)) {
    const id = `watch:${watch.id}:${f.id}`
    const known = alerts.has(id)
    // A known item re-fires only on a real change (stream update), not on every sweep.
    const announce = !opts.silent && !(known && opts.kind !== 'update')
    const change = `${watch.name} · ${Math.round(km)} km${opts.change ? ` · ${opts.change}` : ''}`
    const prev = alerts.get(id)
    const alert = toAlert(f, watch, km, announce ? change : (prev?.props.change as string | undefined))
    if (!announce && (prev ? prev.props.baseline : true)) alert.props.baseline = true
    alerts.delete(id)
    alerts.set(id, alert)
    trim()
    if (announce) publish(LAYER_ID, { type: 'upsert', kind: known ? 'update' : 'new', feature: alert, change })
  }
}

export function snapshot(): LayerResponse {
  return {
    layerId: LAYER_ID,
    generatedAt: new Date().toISOString(),
    // Baseline items are only remembered for dedupe; alerts are what arrived or changed since.
    features: [...alerts.values()].filter((f) => !f.props.baseline),
    providers: [{ id: 'region-watch', ok: true, count: watches.length, ms: 0 }],
  }
}
const heartbeat = (): LiveEvent => ({ type: 'status', at: Date.now(), providers: snapshot().providers, eventsPerMin: eventsPerMin(LAYER_ID) })
registerStream(LAYER_ID, { snapshot, heartbeat })

// A layer's first non-empty load is its baseline: cold caches at boot must not read as a burst of "new" items.
const baselined = new Set<string>()

async function sweep(layers: Record<string, Provider[]>, silent: boolean) {
  // Only the layers some watch covers, and nothing at all without watches: a sweep must not keep every
  // data source (satellites, markets, jamming cells...) awake for nobody.
  if (!watches.length) return
  const wanted = new Set(watches.flatMap((w) => (w.layers.length ? w.layers : DEFAULT_LAYERS)))
  for (const [id, providers] of Object.entries(layers)) {
    if (!wanted.has(id)) continue
    const live = streamSource(id)
    const res = live ? live.snapshot() : await loadLayer(id, providers).catch(() => null)
    const features = res?.features ?? []
    for (const f of features) consider(f, { silent: silent || !baselined.has(id) })
    if (features.length) baselined.add(id)
  }
}

/** Re-read watches (after create/delete) and baseline new ones silently. */
export async function reloadWatches(layers: Record<string, Provider[]>) {
  const before = new Set(watches.map((w) => w.id))
  watches = listWatches()
  const ids = new Set(watches.map((w) => w.id))
  const removed = [...alerts.keys()].filter((k) => !ids.has(Number(k.split(':')[1])))
  removed.forEach((k) => alerts.delete(k))
  if (removed.length) publish(LAYER_ID, { type: 'remove', ids: removed })
  const fresh = watches.filter((w) => !before.has(w.id))
  if (fresh.length) {
    const keep = watches
    watches = fresh
    await sweep(layers, true)
    watches = keep
  }
}

export function startWatchEngine(layers: Record<string, Provider[]>) {
  watches = listWatches()
  for (const s of STREAMS)
    subscribe(s, (e) => {
      if (e.type === 'upsert') consider(e.feature, { kind: e.kind, change: e.change })
    })
  // Polled layers: sweep once silently (baseline), then every minute.
  const polled = Object.fromEntries(Object.entries(layers).filter(([id]) => !STREAMS.includes(id)))
  void sweep(layers, true).then(() => setInterval(() => void sweep(polled, false), 60_000))
}
