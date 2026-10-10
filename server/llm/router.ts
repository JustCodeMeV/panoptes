import Anthropic from '@anthropic-ai/sdk'
import { redact } from '../core/secrets.ts'

/**
 * LLM ROUTER (the OmniRoute pattern, built in): one call, many providers. Each request goes to the first
 * provider in priority order that is healthy and can do what the call needs (JSON, tools, images).
 * Free tiers come first, paid Claude last. Failures are isolated per provider: a 429 cools it down
 * (Retry-After honoured), a rejected key disables it for an hour, an unknown model is locked out,
 * repeated errors open its circuit for five minutes. Keys come from the environment; a provider without
 * a key is skipped, so adding a key later is all it takes to bring one in. There is no dependable keyless
 * provider: every free tier needs a (free, no card) key.
 *
 * Two wire formats cover everything: Anthropic Messages (Claude) and OpenAI chat completions (Gemini,
 * Groq, Cerebras, Mistral, OpenRouter, Pollinations). Messages are kept in a neutral form and converted.
 */

export type Cap = 'json' | 'tools' | 'vision'
export type Part =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; data: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; content: (Extract<Part, { type: 'text' }> | Extract<Part, { type: 'image' }>)[]; isError?: boolean }
export type Msg = {
  role: 'user' | 'assistant'
  parts: Part[]
  /** The provider's own content for this turn (Claude thinking blocks must go back unchanged). */
  raw?: { provider: string; content: unknown }
}
export type ToolDef = { name: string; description: string; schema: Record<string, unknown> }
export type ChatRequest = {
  system: string
  messages: Msg[]
  tools?: ToolDef[]
  /** Final turn: answer in text, no tool calls. */
  noTools?: boolean
  /** Answer with one JSON object (the schema is described in the prompt). */
  json?: boolean
  maxTokens: number
  /** Restrict to these providers (in this order), e.g. a model chosen for "look harder". */
  only?: string[]
  /** Model override for the chosen provider (with `only`). */
  model?: string
  /** Paid providers allowed for this call (default: true when listed in the order). */
  paid?: boolean
  /** Cache the stable prefix where the provider supports it. */
  cache?: boolean
}
export type ChatResponse = {
  provider: string
  model: string
  parts: Part[]
  stop: 'end' | 'tool' | 'length' | 'refusal'
  usage: { in: number; out: number; cacheRead: number; cacheWrite: number }
  costUsd: number
  raw?: unknown
  refusal?: string
}

type Provider = {
  id: string
  kind: 'openai' | 'anthropic'
  base?: string
  key?: string
  model: string
  caps: Cap[]
  free: boolean
  /** Ask providers for strict JSON with response_format. */
  jsonMode?: boolean
}

const env = (k: string) => process.env[k]?.trim() || undefined

/** Built from the environment on each call, so keys added at runtime (or in tests) are picked up. */
function providers(): Provider[] {
  const all: Provider[] = [
    { id: 'gemini', kind: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL') ?? 'gemini-flash-latest', caps: ['json', 'tools', 'vision'], free: true, jsonMode: true },
    { id: 'groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', key: env('GROQ_API_KEY'), model: env('GROQ_MODEL') ?? 'openai/gpt-oss-120b', caps: ['json', 'tools'], free: true, jsonMode: true },
    { id: 'cerebras', kind: 'openai', base: 'https://api.cerebras.ai/v1', key: env('CEREBRAS_API_KEY'), model: env('CEREBRAS_MODEL') ?? 'gpt-oss-120b', caps: ['json', 'tools'], free: true, jsonMode: true },
    { id: 'mistral', kind: 'openai', base: 'https://api.mistral.ai/v1', key: env('MISTRAL_API_KEY'), model: env('MISTRAL_MODEL') ?? 'mistral-small-latest', caps: ['json', 'tools', 'vision'], free: true, jsonMode: true },
    { id: 'openrouter', kind: 'openai', base: 'https://openrouter.ai/api/v1', key: env('OPENROUTER_API_KEY'), model: env('OPENROUTER_MODEL') ?? 'openrouter/free', caps: ['json', 'tools', 'vision'], free: true },
    { id: 'pollinations', kind: 'openai', base: 'https://gen.pollinations.ai/v1', key: env('POLLINATIONS_API_KEY'), model: env('POLLINATIONS_MODEL') ?? 'openai/gpt-5.4-mini', caps: ['json', 'tools', 'vision'], free: true, jsonMode: true },
    // Keyless, opt-in (LLM_ANONYMOUS=1): bare text chat only, and as of 2026-10 Pollinations refuses nearly every
    // real prompt without a key. Kept for when that loosens; a free key is the dependable path.
    { id: 'pollinations-anon', kind: 'openai', base: 'https://gen.pollinations.ai/v1', key: 'anonymous', model: 'openai', caps: [], free: true },
    { id: 'anthropic', kind: 'anthropic', key: env('ANTHROPIC_API_KEY'), model: env('PANOPTES_LLM_MODEL') ?? 'claude-haiku-5-5', caps: ['json', 'tools', 'vision'], free: false },
  ]
  const order = (env('LLM_ORDER') ?? 'gemini,groq,cerebras,mistral,openrouter,pollinations,pollinations-anon,anthropic')
    .split(',')
    .map((s) => s.trim())
    .filter((id) => id !== 'pollinations-anon' || env('LLM_ANONYMOUS') === '1')
  return order.map((id) => all.find((p) => p.id === id)).filter((p): p is Provider => !!p && !!p.key)
}

// ---- health -------------------------------------------------------------------------------------

type Health = { failures: number; openUntil: number; reason?: string; ok: number; lastOk?: number; locked: Map<string, number> }
const health = new Map<string, Health>()
const h = (id: string) => health.get(id) ?? (health.set(id, { failures: 0, openUntil: 0, ok: 0, locked: new Map() }), health.get(id)!)

class ProviderError extends Error {
  status?: number
  retryAfter?: number
  /** The model is unknown to the provider (lock it out, keep the provider). */
  model?: boolean
  constructor(message: string, status?: number, retryAfter?: number, model?: boolean) {
    super(message)
    Object.assign(this, { status, retryAfter, model })
  }
}

function penalize(p: Provider, model: string, e: unknown) {
  const s = h(p.id)
  const err = e instanceof ProviderError ? e : null
  const now = Date.now()
  s.reason = redact(e instanceof Error ? e.message : String(e)).slice(0, 160)
  if (err?.model) return void s.locked.set(model, now + 3600_000)
  if (err?.status === 429) return void (s.openUntil = now + (err.retryAfter ?? 60) * 1000)
  if (err?.status === 401 || err?.status === 403) return void (s.openUntil = now + 3600_000)
  if (err?.status === 402) return void (s.openUntil = now + 6 * 3600_000) // credits or free quota spent
  if (++s.failures >= 3) {
    s.openUntil = now + 5 * 60_000
    s.failures = 0
  }
}
function reward(p: Provider) {
  const s = h(p.id)
  Object.assign(s, { failures: 0, reason: undefined, lastOk: Date.now() })
  s.ok++
}
const usable = (p: Provider, model: string) => h(p.id).openUntil <= Date.now() && (h(p.id).locked.get(model) ?? 0) <= Date.now()

export function routerStatus() {
  const now = Date.now()
  return providers().map((p) => {
    const s = h(p.id)
    return {
      id: p.id, model: p.model, free: p.free, caps: p.caps, ok: s.ok,
      available: usable(p, p.model),
      ...(s.openUntil > now ? { coolingDownS: Math.round((s.openUntil - now) / 1000) } : {}),
      ...(s.reason ? { lastError: s.reason } : {}),
    }
  })
}
/** Can any configured provider serve a call with these needs right now (or after a cooldown)? */
export const canServe = (need: Cap[] = [], paid = true) => providers().some((p) => (paid || p.free) && need.every((c) => p.caps.includes(c)))

// ---- the call -----------------------------------------------------------------------------------

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const need: Cap[] = [...(req.json ? (['json'] as const) : []), ...(req.tools?.length && !req.noTools ? (['tools'] as const) : [])]
  if (req.messages.some((m) => m.parts.some((x) => x.type === 'image' || (x.type === 'tool_result' && x.content.some((c) => c.type === 'image'))))) need.push('vision')
  let list = providers().filter((p) => (req.paid ?? true) || p.free)
  if (req.only) list = req.only.map((id) => list.find((p) => p.id === id)).filter((p): p is Provider => !!p)
  // JSON can be asked for in the prompt; tools and images cannot
  const fit = list.filter((p) => need.every((c) => p.caps.includes(c) || c === 'json'))
  if (!fit.length) throw new Error(`no configured AI provider can do ${need.join(' + ') || 'this'}; add a free key (GEMINI_API_KEY, GROQ_API_KEY, POLLINATIONS_API_KEY…)`)
  const errors: string[] = []
  for (const p of fit) {
    const model = (req.only && req.model) || p.model
    if (!usable(p, model)) {
      errors.push(`${p.id}: cooling down`)
      continue
    }
    try {
      const res = p.kind === 'anthropic' ? await callAnthropic(p, model, req) : await callOpenAI(p, model, req)
      reward(p)
      return res
    } catch (e) {
      penalize(p, model, e)
      errors.push(`${p.id}: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 120)}`)
    }
  }
  throw new Error(`every AI provider failed: ${errors.join(' | ')}`)
}

// ---- OpenAI-compatible --------------------------------------------------------------------------

type OAMsg = { role: string; content?: unknown; tool_calls?: unknown[]; tool_call_id?: string }

/** Neutral → OpenAI chat messages. Images returned by tools go in a user message right after the tool results. */
export function toOpenAI(system: string, messages: Msg[], vision: boolean): OAMsg[] {
  const out: OAMsg[] = [{ role: 'system', content: system }]
  const img = (x: Extract<Part, { type: 'image' }>) => ({ type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}` } })
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.parts.flatMap((x) => (x.type === 'text' ? [x.text] : [])).join('\n')
      const calls = m.parts.flatMap((x) => (x.type === 'tool_call' ? [{ id: x.id, type: 'function', function: { name: x.name, arguments: JSON.stringify(x.input ?? {}) } }] : []))
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) })
      continue
    }
    const pending: unknown[] = []
    const content: unknown[] = []
    for (const x of m.parts) {
      if (x.type === 'tool_result') {
        const text = x.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('\n')
        const imgs = x.content.filter((c): c is Extract<Part, { type: 'image' }> => c.type === 'image')
        out.push({ role: 'tool', tool_call_id: x.id, content: `${x.isError ? 'ERROR: ' : ''}${text || (imgs.length ? `(${imgs.length} image(s) attached below)` : '(empty)')}` })
        if (vision) pending.push(...imgs.map(img))
      } else if (x.type === 'text') content.push({ type: 'text', text: x.text })
      else if (x.type === 'image' && vision) content.push(img(x))
    }
    if (pending.length) out.push({ role: 'user', content: [{ type: 'text', text: 'Images returned by the tool calls above:' }, ...pending] })
    if (content.length) out.push({ role: 'user', content: content.every((c) => (c as { type: string }).type === 'text') ? content.map((c) => (c as { text: string }).text).join('\n') : content })
  }
  return out
}

/** First JSON object in a text (models without JSON mode wrap it in prose or fences). */
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const src = fenced?.[1] ?? text
  const start = src.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  return null
}

async function callOpenAI(p: Provider, model: string, req: ChatRequest): Promise<ChatResponse> {
  const tools = req.tools?.length && p.caps.includes('tools') ? req.tools : undefined
  const body: Record<string, unknown> = {
    model,
    messages: toOpenAI(req.system, req.messages, p.caps.includes('vision')),
    max_tokens: req.maxTokens,
    ...(tools ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })), ...(req.noTools ? { tool_choice: 'none' } : {}) } : {}),
    ...(req.json && p.jsonMode && p.caps.includes('json') ? { response_format: { type: 'json_object' } } : {}),
  }
  // Keyless Pollinations accepts only a bare {model, messages}: no max_tokens, no system role
  if (p.key === 'anonymous') {
    const [sys, ...rest] = body.messages as OAMsg[]
    const flat = rest.map((m) => (typeof m.content === 'string' ? m.content : '')).filter(Boolean).join('\n\n')
    for (const k of Object.keys(body)) if (k !== 'model') delete body[k]
    body.messages = [{ role: 'user', content: `${sys.content as string}\n\n---\n\n${flat}` }]
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (p.key && p.key !== 'anonymous') headers.Authorization = `Bearer ${p.key}`
  if (p.id === 'openrouter') Object.assign(headers, { 'HTTP-Referer': 'https://panoptes-fxcj.onrender.com', 'X-Title': 'ARGUS' })
  const res = await fetch(`${p.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) })
  const text = await res.text()
  if (!res.ok) {
    const missing = res.status === 404 || /model.{0,40}(not.?found|does not exist|unknown|invalid|decommission)/i.test(text)
    throw new ProviderError(`${res.status} ${text.slice(0, 200)}`, res.status, Number(res.headers.get('retry-after')) || undefined, missing)
  }
  const j = JSON.parse(text) as {
    model?: string
    choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]; refusal?: string | null }; finish_reason?: string }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
    error?: { message?: string }
  }
  if (j.error) throw new ProviderError(String(j.error.message ?? 'error').slice(0, 200))
  const choice = j.choices?.[0]
  if (!choice?.message) throw new ProviderError('empty response')
  const parts: Part[] = []
  if (choice.message.content) parts.push({ type: 'text', text: choice.message.content })
  for (const [i, c] of (choice.message.tool_calls ?? []).entries()) {
    let input: unknown = {}
    try {
      input = JSON.parse(c.function?.arguments || '{}')
    } catch {
      input = { _invalid: c.function?.arguments }
    }
    parts.push({ type: 'tool_call', id: c.id || `call_${Date.now().toString(36)}_${i}`, name: c.function?.name ?? '', input })
  }
  const calls = parts.some((x) => x.type === 'tool_call')
  const cached = j.usage?.prompt_tokens_details?.cached_tokens ?? 0
  return {
    provider: p.id,
    model: j.model ?? model,
    parts,
    stop: choice.message.refusal ? 'refusal' : calls && !req.noTools ? 'tool' : choice.finish_reason === 'length' ? 'length' : 'end',
    refusal: choice.message.refusal ?? undefined,
    usage: { in: (j.usage?.prompt_tokens ?? 0) - cached, out: j.usage?.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 },
    costUsd: 0,
  }
}

// ---- Anthropic ----------------------------------------------------------------------------------

// $ per million tokens; cache writes 1.25x input; Haiku 5.5 bills 5x above a 100K-token prompt
const CLAUDE_RATES: Record<string, { in: number; out: number; read: number; long?: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, read: 0.01, long: 100_000 },
  'claude-haiku-4-5': { in: 1, out: 5, read: 0.1 },
  'claude-sonnet-5-5': { in: 2, out: 10, read: 0.2 },
  'claude-opus-5-5': { in: 4, out: 20, read: 0.2 },
}
export function claudeCost(model: string, u: ChatResponse['usage']): number {
  const r = CLAUDE_RATES[model] ?? CLAUDE_RATES['claude-opus-5-5']
  const f = r.long && u.in + u.cacheRead + u.cacheWrite > r.long ? 5 : 1
  return (f * (u.in * r.in + u.cacheWrite * r.in * 1.25 + u.cacheRead * r.read + u.out * r.out)) / 1e6
}
const FALLBACK = new Set(['claude-sonnet-5-5', 'claude-opus-5-5'])
const EFFORT: Record<string, 'high'> = { 'claude-opus-5-5': 'high' }

let anthropic: Anthropic | undefined
let anthropicKey: string | undefined

function toAnthropic(p: Provider, messages: Msg[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.raw?.provider === p.id) return { role: 'assistant', content: m.raw.content as Anthropic.Beta.BetaContentBlockParam[] }
    const content: Anthropic.Beta.BetaContentBlockParam[] = m.parts.map((x): Anthropic.Beta.BetaContentBlockParam => {
      if (x.type === 'text') return { type: 'text', text: x.text }
      if (x.type === 'image') return { type: 'image', source: { type: 'base64', media_type: x.mime as 'image/jpeg', data: x.data } }
      if (x.type === 'tool_call') return { type: 'tool_use', id: x.id, name: x.name, input: x.input ?? {} }
      return {
        type: 'tool_result',
        tool_use_id: x.id,
        is_error: x.isError || undefined,
        content: x.content.map((c) => (c.type === 'text' ? { type: 'text' as const, text: c.text } : { type: 'image' as const, source: { type: 'base64' as const, media_type: c.mime as 'image/jpeg', data: c.data } })),
      }
    })
    return { role: m.role, content: content.length ? content : [{ type: 'text', text: '(empty)' }] }
  })
}

async function callAnthropic(p: Provider, model: string, req: ChatRequest): Promise<ChatResponse> {
  if (!anthropic || anthropicKey !== p.key) {
    anthropic = new Anthropic({ apiKey: p.key, timeout: 180_000, maxRetries: 1 })
    anthropicKey = p.key
  }
  try {
    const res = await anthropic.beta.messages.create({
      model,
      max_tokens: req.maxTokens,
      system: [{ type: 'text', text: req.system, ...(req.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) }],
      messages: toAnthropic(p, req.messages),
      ...(req.tools?.length ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as Anthropic.Beta.BetaTool.InputSchema })) } : {}),
      ...(req.tools?.length && req.noTools ? { tool_choice: { type: 'none' as const } } : {}),
      ...(req.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
      ...(EFFORT[model] ? { output_config: { effort: EFFORT[model] } } : {}),
      // Sonnet/Opus 5.5 safety classifiers can decline legitimate OSINT; the server then retries on a fallback model
      ...(FALLBACK.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    })
    const parts: Part[] = res.content.flatMap((b): Part[] =>
      b.type === 'text' ? [{ type: 'text', text: b.text }] : b.type === 'tool_use' ? [{ type: 'tool_call', id: b.id, name: b.name, input: b.input }] : [],
    )
    const usage = { in: res.usage.input_tokens, out: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0, cacheWrite: res.usage.cache_creation_input_tokens ?? 0 }
    return {
      provider: p.id,
      model,
      parts,
      raw: res.content,
      stop: res.stop_reason === 'refusal' ? 'refusal' : res.stop_reason === 'tool_use' ? 'tool' : res.stop_reason === 'max_tokens' ? 'length' : 'end',
      refusal: res.stop_reason === 'refusal' ? (res.stop_details?.explanation ?? 'declined') : undefined,
      usage,
      costUsd: claudeCost(model, usage),
    }
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const retry = Number(e.headers?.get?.('retry-after')) || undefined
      throw new ProviderError(`${e.status ?? ''} ${e.message}`.slice(0, 200), e.status, retry, e.status === 404)
    }
    throw e
  }
}

/** For tests: forget provider health. */
export const resetRouter = () => health.clear()
