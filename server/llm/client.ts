import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod/v4'
import { redact } from '../core/secrets.ts'

/**
 * Thin, budgeted wrapper around Claude. Everything here is OPTIONAL: without
 * ANTHROPIC_API_KEY every call resolves to null and callers keep their
 * keyword-based behaviour. Spend is bounded by an hourly call cap.
 */

const MODEL = process.env.PANOPTES_LLM_MODEL || 'claude-haiku-4-5'
const MAX_PER_HOUR = Number(process.env.PANOPTES_LLM_MAX_PER_HOUR) || 60

let client: Anthropic | null | undefined
const getClient = () => (client === undefined ? (client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 30_000, maxRetries: 1 }) : null) : client)

const calls: number[] = []
let lastError: string | undefined
let ok = 0

export const llmEnabled = () => !!getClient()

export function llmStatus() {
  const now = Date.now()
  const lastHour = calls.filter((t) => now - t < 3600_000).length
  return {
    id: `llm:${MODEL}`,
    ok: llmEnabled() && !lastError,
    count: ok,
    error: !llmEnabled() ? 'no ANTHROPIC_API_KEY' : lastError ?? (lastHour >= MAX_PER_HOUR ? 'hourly cap reached' : undefined),
  }
}

function takeSlot(): boolean {
  const now = Date.now()
  while (calls.length && now - calls[0] > 3600_000) calls.shift()
  if (calls.length >= MAX_PER_HOUR) return false
  calls.push(now)
  return true
}

/** One structured call. Resolves null when disabled, over budget, refused or failed. */
export async function structured<T>(opts: { system: string; prompt: string; schema: z.ZodType<T>; maxTokens?: number }): Promise<T | null> {
  const c = getClient()
  if (!c || !takeSlot()) return null
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
      output_config: { format: zodOutputFormat(opts.schema) },
    })
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      lastError = `stopped: ${res.stop_reason}`
      return null
    }
    lastError = undefined
    ok++
    return res.parsed_output ?? null
  } catch (e) {
    lastError = redact(e instanceof Anthropic.APIError ? `API ${e.status ?? ''} ${e.message}`.slice(0, 160) : e instanceof Error ? e.message : String(e))
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
