import { redact } from './secrets.ts'

/**
 * One polite client for Google Trends' "trending now" RSS, shared by every
 * caller (truth sensor signals, search-trends layer). Requests go out one at a
 * time, GAP_MS apart; each country is cached for TTL_MS; a 429 pauses the
 * whole client for PAUSE_MS while callers keep getting the last good copy.
 * Google rate-limits per IP, so uncoordinated callers would starve each other.
 */

const TTL_MS = 30 * 60_000
const GAP_MS = 1500
const PAUSE_MS = 15 * 60_000

const cache = new Map<string, { xml: string; at: number }>()
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
        cache.set(geo, { xml: await res.text(), at: Date.now() })
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

/** Queues a refresh when the cached copy is older than TTL (no-op otherwise). */
export function refresh(geo: string) {
  const c = cache.get(geo)
  if (c && Date.now() - c.at < TTL_MS) return
  if (!queue.includes(geo) && !inflight.has(geo)) queue.push(geo)
  void pump()
}

/** Cached RSS for a country, possibly stale; undefined before the first successful fetch. */
export const cached = (geo: string) => cache.get(geo)

/** Fresh-enough RSS for a country: waits for the queue if needed, falls back to a stale copy. */
export async function trendingRss(geo: string): Promise<string> {
  const c = cache.get(geo)
  if (c && Date.now() - c.at < TTL_MS) return c.xml
  const done = new Promise<boolean>((r) => waiters.set(geo, [...(waiters.get(geo) ?? []), r]))
  refresh(geo)
  await Promise.race([done, sleep(20_000)])
  const now = cache.get(geo)
  if (now) return now.xml
  throw new Error(lastError ?? 'Google Trends not reachable yet')
}

export const trendsError = () => lastError
