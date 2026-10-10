import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { z } from 'zod/v4'
import { structured } from '../server/llm/client.ts'
import { chat, claudeCost, extractJson, resetRouter, routerStatus, toOpenAI } from '../server/llm/router.ts'

const KEYS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'POLLINATIONS_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_ORDER', 'LLM_ANONYMOUS']
const saved: Record<string, string | undefined> = {}
const realFetch = globalThis.fetch
let seen: string[] = []

const okBody = (content: string, tool?: { name: string; args: string }) =>
  new Response(JSON.stringify({ model: 'x', choices: [{ message: { content, ...(tool ? { tool_calls: [{ id: 'c1', function: { name: tool.name, arguments: tool.args } }] } : {}) }, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 })

/** Mock fetch: `script[host]` answers for that provider. */
function mock(script: Record<string, () => Response>) {
  globalThis.fetch = (async (url: string | URL) => {
    const host = new URL(String(url)).hostname
    seen.push(host)
    const key = Object.keys(script).find((k) => host.includes(k))
    return key ? script[key]() : new Response('no', { status: 500 })
  }) as typeof fetch
}

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  process.env.LLM_ANONYMOUS = '0'
  resetRouter()
  seen = []
})
afterEach(() => {
  globalThis.fetch = realFetch
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

const msg = [{ role: 'user' as const, parts: [{ type: 'text' as const, text: 'hi' }] }]

test('router: falls back on 429 and remembers the cooldown', async () => {
  Object.assign(process.env, { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', LLM_ORDER: 'gemini,groq' })
  mock({ generativelanguage: () => new Response('slow down', { status: 429, headers: { 'retry-after': '30' } }), groq: () => okBody('from groq') })
  const a = await chat({ system: 's', messages: msg, maxTokens: 100 })
  assert.equal(a.provider, 'groq')
  assert.deepEqual(seen, ['generativelanguage.googleapis.com', 'api.groq.com'])
  seen = []
  await chat({ system: 's', messages: msg, maxTokens: 100 })
  assert.deepEqual(seen, ['api.groq.com'], 'gemini is skipped while cooling down')
  assert.ok((routerStatus().find((p) => p.id === 'gemini')?.coolingDownS ?? 0) > 0)
})

test('router: a rejected key disables the provider; needs pick capable providers only', async () => {
  Object.assign(process.env, { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', LLM_ORDER: 'groq,gemini' })
  mock({ groq: () => new Response('bad key', { status: 401 }), generativelanguage: () => okBody('ok') })
  // An image in the request: groq (no vision) is not even tried
  const img = [{ role: 'user' as const, parts: [{ type: 'image' as const, mime: 'image/jpeg', data: 'AA==' }] }]
  const a = await chat({ system: 's', messages: img, maxTokens: 100 })
  assert.equal(a.provider, 'gemini')
  assert.deepEqual(seen, ['generativelanguage.googleapis.com'])
  seen = []
  await chat({ system: 's', messages: msg, maxTokens: 100 })
  assert.deepEqual(seen, ['api.groq.com', 'generativelanguage.googleapis.com'])
  assert.equal(routerStatus().find((p) => p.id === 'groq')?.available, false)
})

test('router: tool calls come back as neutral parts; no capable provider is a clear error', async () => {
  Object.assign(process.env, { GROQ_API_KEY: 'q', LLM_ORDER: 'groq' })
  mock({ groq: () => okBody('', { name: 'run_script', args: '{"script":"board","args":["rank"]}' }) })
  const r = await chat({ system: 's', messages: msg, tools: [{ name: 'run_script', description: 'd', schema: { type: 'object' } }], maxTokens: 100 })
  assert.equal(r.stop, 'tool')
  assert.deepEqual(r.parts[0], { type: 'tool_call', id: 'c1', name: 'run_script', input: { script: 'board', args: ['rank'] } })
  const img = [{ role: 'user' as const, parts: [{ type: 'image' as const, mime: 'image/png', data: 'AA==' }] }]
  await assert.rejects(chat({ system: 's', messages: img, maxTokens: 10 }), /no configured AI provider can do vision/)
})

test('structured: JSON from a free provider, validated by the schema', async () => {
  Object.assign(process.env, { GEMINI_API_KEY: 'g', LLM_ORDER: 'gemini' })
  mock({ generativelanguage: () => okBody('Sure:\n```json\n{"language": "Ukrainian", "n": 3}\n```') })
  const out = await structured({ system: 's', prompt: 'p', schema: z.object({ language: z.string(), n: z.number() }) })
  assert.deepEqual(out, { language: 'Ukrainian', n: 3 })
  mock({ generativelanguage: () => okBody('{"language": 5}') })
  assert.equal(await structured({ system: 's', prompt: 'p2', schema: z.object({ language: z.string() }) }), null)
})

test('toOpenAI: tool results become tool messages, their images follow in a user message', () => {
  const out = toOpenAI('sys', [
    { role: 'assistant', parts: [{ type: 'text', text: 'looking' }, { type: 'tool_call', id: 't1', name: 'view_image', input: { path: 'a.jpg' } }] },
    { role: 'user', parts: [{ type: 'tool_result', id: 't1', content: [{ type: 'image', mime: 'image/jpeg', data: 'AA==' }] }, { type: 'text', text: '[budget] 1/40' }] },
  ], true)
  assert.deepEqual(out.map((m) => m.role), ['system', 'assistant', 'tool', 'user', 'user'])
  assert.equal(out[2].tool_call_id, 't1')
  assert.match(JSON.stringify(out[3].content), /data:image\/jpeg;base64,AA==/)
  // without vision the image is dropped, the tool message says so
  assert.deepEqual(toOpenAI('s', [{ role: 'user', parts: [{ type: 'tool_result', id: 'x', content: [{ type: 'image', mime: 'image/png', data: 'A' }] }] }], false).map((m) => m.role), ['system', 'tool'])
})

test('extractJson and claudeCost', () => {
  assert.equal(extractJson('noise {"a": {"b": "}"}} tail'), '{"a": {"b": "}"}}')
  assert.equal(extractJson('none'), null)
  assert.equal(claudeCost('claude-sonnet-5-5', { in: 1e6, out: 1e6, cacheRead: 0, cacheWrite: 0 }), 12)
  assert.equal(claudeCost('claude-opus-5-5', { in: 0, out: 0, cacheRead: 1e6, cacheWrite: 1e6 }), 5.2)
  assert.ok(Math.abs(claudeCost('claude-haiku-5-5', { in: 150_000, out: 0, cacheRead: 0, cacheWrite: 0 }) - 0.075) < 1e-9)
})
