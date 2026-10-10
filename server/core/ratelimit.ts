import type { Context, Next } from 'hono'
import { every } from '../runtime/jobs.ts'

/** Client IP: Render's proxy puts the real client first in x-forwarded-for. */
export function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? 'unknown'
}

/**
 * Fixed-window, per-IP limiter for endpoints that cost money or upstream quota
 * (LLM calls, claim checks). In memory: enough for a single instance.
 */
export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  every(`ratelimit:${opts.name}`, opts.windowMs, () => {
    const now = Date.now()
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
  })
  return async (c: Context, next: Next) => {
    const key = clientIp(c)
    const now = Date.now()
    const h = hits.get(key)
    const cur = h && h.resetAt > now ? h : { count: 0, resetAt: now + opts.windowMs }
    cur.count++
    hits.set(key, cur)
    if (cur.count > opts.max) {
      c.header('retry-after', String(Math.ceil((cur.resetAt - now) / 1000)))
      return c.json({ error: `rate limit: ${opts.max} ${opts.name} per ${Math.round(opts.windowMs / 60_000)} min` }, 429)
    }
    await next()
  }
}
