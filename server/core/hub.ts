import type { LayerResponse } from '../../shared/feature.ts'
import type { LiveEvent } from '../../shared/live.ts'

/**
 * Pub/sub for push-driven layers. An engine registers itself once
 * (`registerStream`) and calls `publish` whenever something changes; the
 * generic SSE route in server/index.ts does the rest.
 */
export type StreamSource = { snapshot(): LayerResponse; heartbeat(): LiveEvent }

const sources = new Map<string, StreamSource>()
const listeners = new Map<string, Set<(e: LiveEvent) => void>>()
const recent = new Map<string, number[]>()

export function registerStream(layerId: string, source: StreamSource) {
  sources.set(layerId, source)
}
export const streamSource = (layerId: string) => sources.get(layerId)

export function publish(layerId: string, e: LiveEvent) {
  if (e.type === 'upsert') {
    const r = recent.get(layerId) ?? []
    r.push(Date.now())
    recent.set(layerId, r)
  }
  for (const l of listeners.get(layerId) ?? []) l(e)
}

export function subscribe(layerId: string, fn: (e: LiveEvent) => void) {
  const set = listeners.get(layerId) ?? new Set()
  set.add(fn)
  listeners.set(layerId, set)
  return () => set.delete(fn)
}

export function eventsPerMin(layerId: string): number {
  const cut = Date.now() - 60_000
  const r = (recent.get(layerId) ?? []).filter((t) => t > cut)
  recent.set(layerId, r)
  return r.length
}
