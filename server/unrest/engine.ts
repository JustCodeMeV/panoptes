import type { Feature } from '../../shared/feature.ts'
import { ROOT_LABEL, fetchExport, latestStamp, parseStamp, stamp, titleFromUrl, type GdeltEvent } from './gdelt.ts'
import { every, once } from '../runtime/jobs.ts'

export const LAYER_ID = 'unrest'
const WINDOW_MS = 12 * 3600_000
const PRIME_FILES = 24 // 6 h of history on start-up
const CELL = 0.25 // degrees: events within a cell are one hotspot

export type UnrestProps = {
  kind: 'unrest'
  count: number
  mentions: number
  sources: number
  dominant: string
  breakdown: Record<string, number>
  tone: number
  trend: number
  countryCode: string
  articles: { url: string; title: string; label: string; at: number }[]
}

const events = new Map<string, GdeltEvent>()
const fetched = new Set<string>()
let lastError: string | undefined
let lastOk = 0

export { titleFromUrl } from './gdelt.ts'

async function ingest(ts: string): Promise<boolean> {
  if (fetched.has(ts)) return true
  const evs = await fetchExport(ts)
  if (!evs) return false
  fetched.add(ts)
  for (const e of evs) events.set(e.id, e)
  return true
}

function prune() {
  const cut = Date.now() - WINDOW_MS
  for (const [id, e] of events) if (e.at < cut) events.delete(id)
}

let started = false
export function startUnrestEngine() {
  if (started) return
  started = true
  const tick = async (prime: boolean) => {
    try {
      const latest = await latestStamp()
      const base = parseStamp(latest)
      const n = prime ? PRIME_FILES : 4
      // Fetch newest first, sequentially in small batches: polite and fast enough.
      const stamps = Array.from({ length: n }, (_, i) => stamp(new Date(base - i * 900_000)))
      for (let i = 0; i < stamps.length; i += 6) await Promise.all(stamps.slice(i, i + 6).map((s) => ingest(s).catch(() => false)))
      prune()
      lastOk = Date.now()
      lastError = undefined
      if (prime) console.log(`[unrest] primed: ${events.size} events from ${fetched.size} files`)
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.warn(`[unrest] ${lastError}`)
      if (prime) once('unrest:retry', 15_000, () => void tick(true)) // start-up failure: retry soon
    }
  }
  void tick(true)
  every('unrest', 5 * 60_000, () => void tick(false))
}

export const health = () => ({ ok: !lastError && lastOk > 0, error: lastError, events: events.size, files: fetched.size, lastOk })

/** Aggregates events into hotspots by ~25 km cell. */
export function hotspots(): Feature[] {
  const cells = new Map<string, GdeltEvent[]>()
  for (const e of events.values()) {
    const key = `${Math.round(e.lat / CELL)}:${Math.round(e.lon / CELL)}`
    const list = cells.get(key)
    if (list) list.push(e)
    else cells.set(key, [e])
  }
  const now = Date.now()
  const out: Feature[] = []
  for (const [key, list] of cells) {
    const urls = new Map<string, GdeltEvent>()
    for (const e of list) if (!urls.has(e.url)) urls.set(e.url, e)
    const sources = new Set(list.flatMap((e) => [e.url])).size
    // GDELT is machine-coded and noisy: a hotspot needs several independent articles.
    if (sources < 3) continue
    const breakdown: Record<string, number> = {}
    for (const e of list) breakdown[ROOT_LABEL[e.root]] = (breakdown[ROOT_LABEL[e.root]] ?? 0) + 1
    const dominant = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0][0]
    const weights = list.reduce((n, e) => n + e.mentions, 0)
    const lat = list.reduce((n, e) => n + e.lat * e.mentions, 0) / weights
    const lon = list.reduce((n, e) => n + e.lon * e.mentions, 0) / weights
    const best = [...list].sort((a, b) => b.mentions - a.mentions)[0]
    const recent = list.filter((e) => e.at > now - 3 * 3600_000).length
    const older = list.length - recent
    const articles = [...urls.values()]
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 8)
      .map((e) => ({ url: e.url, title: titleFromUrl(e.url), label: ROOT_LABEL[e.root], at: e.at }))
    const props: UnrestProps = {
      kind: 'unrest',
      count: list.length,
      mentions: weights,
      sources,
      dominant,
      breakdown,
      tone: list.reduce((n, e) => n + e.tone, 0) / list.length,
      trend: recent - older / 3, // >0: heating up (last 3 h vs the 9 h before, normalised per hour)
      countryCode: best.country,
      articles,
    }
    out.push({
      id: `${LAYER_ID}:${key}`,
      layerId: LAYER_ID,
      // "Reports", not "activity": these are machine-coded news reports, not confirmed events.
      title: `${best.place.split(',')[0] || 'Unknown place'}: ${dominant} reports`,
      position: { lat, lon },
      geoPrecision: 'approximate',
      geoBasis: `GDELT ActionGeo "${best.place}" (city centroid), mention-weighted over ${list.length} events`,
      observedAt: new Date(Math.max(...list.map((e) => e.at))).toISOString(),
      source: { provider: 'gdelt-events', platform: 'GDELT', url: best.url, retrievedAt: new Date().toISOString() },
      tags: ['unrest', ...Object.keys(breakdown)],
      props: props as unknown as Record<string, unknown>,
    })
  }
  return out.sort((a, b) => Number(b.props.mentions) - Number(a.props.mentions)).slice(0, 250)
}
