import { z } from 'zod/v4'
import { redact } from '../core/secrets.ts'
import { canServe, chat, extractJson, routerStatus } from './router.ts'

/**
 * Structured AI calls for the engines (extraction, briefs, translation, fact-check judging), through the
 * provider router (./router.ts): free tiers first, paid Claude last.
 * Everything here is OPTIONAL: when no provider answers, calls resolve to null and callers keep their
 * keyword-based behaviour. An hourly call cap protects the free quotas as much as any bill.
 */

const MAX_PER_HOUR = Number(process.env.PANOPTES_LLM_MAX_PER_HOUR) || 60

const calls: number[] = []
let lastError: string | undefined
let ok = 0
let lastProvider: string | undefined

const paidAllowed = () => process.env.PANOPTES_LLM_PAID === '1'
export const llmEnabled = () => canServe([], paidAllowed())

export function llmStatus() {
  const now = Date.now()
  const lastHour = calls.filter((t) => now - t < 3600_000).length
  const providers = routerStatus()
  return {
    id: `llm:${lastProvider ?? providers.find((p) => p.available)?.id ?? 'none'}`,
    ok: llmEnabled() && providers.some((p) => p.available) && !lastError,
    count: ok,
    error: !llmEnabled() ? 'no AI provider configured' : lastHour >= MAX_PER_HOUR ? 'hourly cap reached' : lastError,
    providers,
  }
}

function takeSlot(): boolean {
  const now = Date.now()
  while (calls.length && now - calls[0] > 3600_000) calls.shift()
  if (calls.length >= MAX_PER_HOUR) return false
  calls.push(now)
  return true
}

/** One structured call: a JSON object validated against `schema`. Null when no provider could answer validly. */
export async function structured<T>(opts: { system: string; prompt: string; schema: z.ZodType<T>; maxTokens?: number }): Promise<T | null> {
  if (!llmEnabled() || !takeSlot()) return null
  const shape = JSON.stringify(z.toJSONSchema(opts.schema))
  try {
    const res = await chat({
      system: `${opts.system}\n\nAnswer with exactly one JSON object and nothing else. It must validate against this JSON Schema:\n${shape}`,
      messages: [{ role: 'user', parts: [{ type: 'text', text: opts.prompt }] }],
      json: true,
      maxTokens: opts.maxTokens ?? 2000,
      // Background work stays on free providers unless paid ones are allowed explicitly
      paid: paidAllowed(),
    })
    lastProvider = res.provider
    if (res.stop === 'refusal' || res.stop === 'length') {
      lastError = `stopped: ${res.stop} (${res.provider})`
      return null
    }
    const text = res.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
    const raw = extractJson(text)
    const parsed = raw ? opts.schema.safeParse(JSON.parse(raw)) : null
    if (!parsed?.success) {
      lastError = `invalid JSON from ${res.provider}`
      return null
    }
    lastError = undefined
    ok++
    return parsed.data
  } catch (e) {
    lastError = redact(e instanceof Error ? e.message : String(e)).slice(0, 200)
    console.warn(`[llm] ${lastError}`)
    return null
  }
}

/** Memoizes async results by key; an in-flight request is shared, failures are not cached. */
export function memo<T>(max = 300) {
  const m = new Map<string, Promise<T | null>>()
  return (key: string, fn: () => Promise<T | null>): Promise<T | null> => {
    const hit = m.get(key)
    if (hit) return hit
    const p = fn().then((v) => {
      if (v === null) m.delete(key)
      return v
    })
    m.set(key, p)
    if (m.size > max) m.delete(m.keys().next().value!)
    return p
  }
}
