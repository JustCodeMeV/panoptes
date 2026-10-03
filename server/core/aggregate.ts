import type { Feature, LayerResponse, ProviderStatus } from '../../shared/feature.ts'
import { TtlCache } from './cache.ts'
import type { Provider } from './provider.ts'
import { redact } from './secrets.ts'

/** Merged layer responses: cheap to rebuild because providers are cached individually below. */
const cache = new TtlCache<LayerResponse>(15_000)

const DEFAULT_TTL = 5 * 60_000
const MAX_BACKOFF = 30 * 60_000

type State = { features: Feature[]; okAt: number; tryAt: number; failures: number; error?: string; ms: number; inflight?: Promise<void> }
const states = new Map<string, State>()

/** Rate-limited or blocked: the message carries the status code (`HTTP 429 host`). */
const statusOf = (msg: string) => Number(msg.match(/\bHTTP (\d{3})\b/)?.[1]) || 0

/** Next attempt after the n-th consecutive failure: exponential, longer for 429/403, capped. */
export function backoffMs(failures: number, ttl: number, status: number): number {
  const base = status === 429 || status === 403 ? Math.max(ttl, 5 * 60_000) : Math.max(Math.min(ttl, 5 * 60_000), 30_000)
  return Math.min(MAX_BACKOFF, base * 2 ** Math.max(0, failures - 1))
}

const ago = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`)

/**
 * One provider, politely: each upstream is called at most once per its TTL
 * no matter how many clients poll; failures back off exponentially (longer on
 * 429/403); and the last good data keeps being served (flagged stale) while a
 * source is down. Missing keys short-circuit without a request or a log line.
 */
async function runProvider(p: Provider): Promise<{ features: Feature[]; status: ProviderStatus }> {
  const missing = (p.requires ?? []).filter((k) => !process.env[k])
  if (missing.length) return { features: [], status: { id: p.id, ok: false, count: 0, ms: 0, error: `no ${missing.join(' / ')}` } }

  const ttl = p.ttlMs ?? DEFAULT_TTL
  const s = states.get(p.id) ?? { features: [], okAt: 0, tryAt: 0, failures: 0, ms: 0 }
  states.set(p.id, s)
  const now = Date.now()
  const due = now >= s.tryAt && (!s.okAt || now - s.okAt >= ttl || s.failures > 0)
  if (due && !s.inflight) {
    s.inflight = (async () => {
      const t0 = Date.now()
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 25_000)
      try {
        s.features = await p.fetch({ signal: ac.signal })
        if (s.failures) console.log(`[provider:${p.id}] recovered after ${s.failures} failure(s)`)
        s.okAt = Date.now()
        s.tryAt = s.okAt + ttl
        s.failures = 0
        s.error = undefined
      } catch (e) {
        s.error = redact(e instanceof Error ? e.message : String(e))
        s.failures++
        const wait = backoffMs(s.failures, ttl, statusOf(s.error))
        s.tryAt = Date.now() + wait
        // Log transitions and then rarely, not every poll.
        if (s.failures === 1 || s.failures % 10 === 0) console.warn(`[provider:${p.id}] failed (${s.failures}x): ${s.error}; retry in ${ago(wait)}`)
      } finally {
        clearTimeout(timer)
        s.ms = Date.now() - t0
        s.inflight = undefined
      }
    })()
  }
  // First load waits for the request; later ones answer from cache immediately.
  if (s.inflight && !s.okAt && !s.error) await s.inflight
  const stale = !!s.error && s.okAt > 0
  return {
    features: s.features,
    status: {
      id: p.id,
      ok: !s.error || stale,
      count: s.features.length,
      ms: s.ms,
      error: s.error ? (stale ? `${s.error} (showing data from ${ago(Date.now() - s.okAt)} ago)` : s.error) : undefined,
      ...(stale ? { stale: true } : {}),
    },
  }
}

/**
 * Runs every enabled provider of a layer in parallel. One provider failing
 * never takes the layer down; failures are reported in `providers[]`.
 * Features are deduped by id (earlier providers win).
 */
export function loadLayer(layerId: string, providers: Provider[]): Promise<LayerResponse> {
  return cache.get(layerId, async () => {
    const active = providers.filter((p) => p.enabled?.() ?? true)
    const results = await Promise.all(active.map(runProvider))
    const byId = new Map<string, Feature>()
    for (const r of results) for (const f of r.features) if (!byId.has(f.id)) byId.set(f.id, f)
    return {
      layerId,
      generatedAt: new Date().toISOString(),
      features: [...byId.values()],
      providers: results.map((r) => r.status),
    }
  })
}
