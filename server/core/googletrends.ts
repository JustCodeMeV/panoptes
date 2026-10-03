import { redact } from './secrets.ts'

/**
 * One client for Google Trends' "trending now" RSS, shared by every caller
 * (truth sensor signals, search-trends layer).
 *
 * Primary source: the relay file that GitHub Actions publishes every 30 min
 * (scripts/trends-relay.ts -> `data` branch), fetched every RELAY_EVERY_MS.
 * Google rate-limits per IP and has flagged our server, so the server itself
 * only calls Google when the relay is unreachable or older than RELAY_STALE_MS;
 * then requests go out one at a time, GAP_MS apart, and a 429 pauses the
 * whole client for PAUSE_MS while callers keep getting the last good copy.
 */

const TTL_MS = 30 * 60_000
const GAP_MS = 1500
const PAUSE_MS = 15 * 60_000

const RELAY_URL = process.env.TRENDS_RELAY_URL || 'https://raw.githubusercontent.com/JustCodeMeV/panoptes/data/trends.json'
const RELAY_EVERY_MS = 10 * 60_000
const RELAY_STALE_MS = 3 * 3600_000

const cache = new Map<string, { xml: string; at: number; via: 'relay' | 'direct' }>()
let relayAt = 0 // when the relay file was last published (fetchedAt)
let relayTriedAt = 0
let relayInflight: Promise<void> | undefined

/** Loads the relay file into the cache (at most every RELAY_EVERY_MS). */
function pullRelay(): Promise<void> {
  if (relayInflight || Date.now() - relayTriedAt < RELAY_EVERY_MS) return relayInflight ?? Promise.resolve()
  relayTriedAt = Date.now()
  relayInflight = (async () => {
    try {
      const res = await fetch(RELAY_URL, { headers: { 'user-agent': 'panoptes/1.0' }, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`relay HTTP ${res.status}`)
      const j = (await res.json()) as { fetchedAt?: string; feeds?: Record<string, { xml: string; at: number }> }
      for (const [geo, f] of Object.entries(j.feeds ?? {})) {
        const have = cache.get(geo)
        if (f?.xml && (!have || f.at > have.at)) cache.set(geo, { xml: f.xml, at: f.at, via: 'relay' })
      }
      relayAt = Date.parse(j.fetchedAt ?? '') || 0
      lastError = undefined
    } catch (e) {
      lastError = redact(`trends relay: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      relayInflight = undefined
    }
  })()
  return relayInflight
}
const relayFresh = () => relayAt > 0 && Date.now() - relayAt < RELAY_STALE_MS
const queue: string[] = []
const inflight = new Set<string>()
const waiters = new Map<string, ((ok: boolean) => void)[]>()
let running = false
let pausedUntil = 0
let lastError: string | undefined

// Timers are unref'd: a pending wait never keeps the process (or a test run) alive.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms).unref())

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const wait = pausedUntil - Date.now()
      if (wait > 0) await sleep(wait)
      const geo = queue.shift()!
      inflight.add(geo)
      let ok = false
      try {
        const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, { headers: { 'user-agent': 'Mozilla/5.0 panoptes-research/0.1' }, signal: AbortSignal.timeout(15_000) })
        if (res.status === 429) {
          pausedUntil = Date.now() + PAUSE_MS
          throw new Error(`HTTP 429 trends.google.com (pausing ${PAUSE_MS / 60_000} min)`)
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} trends.google.com`)
        cache.set(geo, { xml: await res.text(), at: Date.now(), via: 'direct' })
        lastError = undefined
        ok = true
      } catch (e) {
        lastError = redact(e instanceof Error ? e.message : String(e))
      }
      inflight.delete(geo)
      for (const w of waiters.get(geo) ?? []) w(ok)
      waiters.delete(geo)
      await sleep(GAP_MS)
    }
  } finally {
    running = false
  }
}

/** Pulls the relay; queues a direct fetch only when the relay is down/stale and the copy is older than TTL. */
export function refresh(geo: string) {
  void pullRelay()
  if (relayFresh()) return
  const c = cache.get(geo)
  if (c && Date.now() - c.at < TTL_MS) return
  if (!queue.includes(geo) && !inflight.has(geo)) queue.push(geo)
  void pump()
}

/** Cached RSS for a country, possibly stale; undefined before the first successful fetch. */
export const cached = (geo: string) => cache.get(geo)

/** Fresh-enough RSS for a country: waits for the queue if needed, falls back to a stale copy. */
export async function trendingRss(geo: string): Promise<string> {
  await pullRelay()
  const c = cache.get(geo)
  if (c && (relayFresh() || Date.now() - c.at < TTL_MS)) return c.xml
  const done = new Promise<boolean>((r) => waiters.set(geo, [...(waiters.get(geo) ?? []), r]))
  refresh(geo)
  await Promise.race([done, sleep(20_000)])
  const now = cache.get(geo)
  if (now) return now.xml
  throw new Error(lastError ?? 'Google Trends not reachable yet')
}

export const trendsError = () => lastError

/** Where the data comes from and how old the relay is, for the layer's provenance line. */
export const trendsSource = () => ({ relayAt, relayFresh: relayFresh() })
