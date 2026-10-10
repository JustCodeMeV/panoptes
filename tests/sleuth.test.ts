import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChatRequest, ChatResponse, Part } from '../server/llm/router.ts'
import { parseFinding, runAgent, type AgentState, type Deps } from '../server/sleuth/agent.ts'
import { imageKind } from '../server/sleuth/runs.ts'

const resp = (parts: Part[], stop: ChatResponse['stop'], costUsd = 0): ChatResponse => ({ provider: 'gemini', model: 'm', parts, stop, usage: { in: 1000, out: 500, cacheRead: 0, cacheWrite: 0 }, costUsd })
const call = (id: string, script: string): Part => ({ type: 'tool_call', id, name: 'run_script', input: { script, args: ['rank'] } })
const final = 'Done.\n```json\n{"lat": 35.1, "lon": 139.2, "radius_m": 500, "place": "Somewhere", "level": "area", "confidence": "medium"}\n```'
const state = (over: Partial<AgentState> = {}): AgentState => ({
  route: { paid: true }, model: '', messages: [{ role: 'user', parts: [{ type: 'text', text: 'go' }] }], steps: [], toolCalls: 0, costUsd: 0, budget: { steps: 10, usd: 1 }, ...over,
})
const ok = async () => ({ content: [{ type: 'text' as const, text: 'ok' }], isError: false, summary: 's' })

test('parseFinding: last JSON block, coordinates validated', () => {
  assert.equal(parseFinding(final)?.lat, 35.1)
  assert.equal(parseFinding('```json\n{"lat": 95, "lon": 10}\n```')?.lat, undefined)
  assert.equal(parseFinding('no block'), undefined)
  assert.equal(parseFinding('```json\nnot json\n```'), undefined)
})

test('imageKind: magic bytes, not names', () => {
  assert.equal(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpg')
  assert.equal(imageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'png')
  assert.equal(imageKind(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'webp')
  assert.equal(imageKind(new TextEncoder().encode('<html>')), null)
})

test('agent: runs tools, returns all results of a turn in one message, then concludes', async () => {
  const reqs: ChatRequest[] = []
  const replies = [resp([call('a', 'board'), call('b', 'clues')], 'tool'), resp([{ type: 'text', text: final }], 'end')]
  const ran: string[] = []
  const deps: Deps = {
    chat: async (r) => (reqs.push(structuredClone(r)), replies.shift()!),
    exec: async (_n, input) => (ran.push((input as { script: string }).script), ok()),
    cancelled: () => false,
  }
  const s = await runAgent(state(), 'sys', deps)
  assert.deepEqual(ran, ['board', 'clues'])
  assert.equal(s.stop, 'done')
  assert.equal(s.finding?.place, 'Somewhere')
  assert.equal(s.toolCalls, 2)
  assert.equal(s.model, 'gemini/m')
  const last = reqs[1].messages.at(-1)!.parts
  assert.deepEqual(last.map((p) => p.type), ['tool_result', 'tool_result', 'text'])
  assert.equal(reqs[0].cache, true)
})

test('agent: step budget reached → one last request without tools, then stop', async () => {
  const reqs: ChatRequest[] = []
  const deps: Deps = {
    chat: async (r) => (reqs.push(r), r.noTools ? resp([{ type: 'text', text: final }], 'end') : resp([call(`t${reqs.length}`, 'osm')], 'tool')),
    exec: ok,
    cancelled: () => false,
  }
  const s = await runAgent(state({ budget: { steps: 3, usd: 1 } }), 'sys', deps)
  assert.equal(s.toolCalls, 3)
  assert.equal(s.stop, 'budget')
  assert.equal(reqs.at(-1)!.noTools, true)
  assert.equal(reqs.length, 4)
})

test('agent: dollar cap counts paid calls only', async () => {
  let n = 0
  const deps: Deps = {
    chat: async (r) => (n++, r.noTools ? resp([{ type: 'text', text: 'stopped' }], 'end') : resp([call(`t${n}`, 'osm')], 'tool', 0.0004)),
    exec: ok,
    cancelled: () => false,
  }
  const s = await runAgent(state({ budget: { steps: 100, usd: 0.001 } }), 'sys', deps)
  assert.equal(s.stop, 'budget')
  assert.ok(n <= 5)
})

test('agent: refusal and provider errors end the run with a reason', async () => {
  const refused = await runAgent(state(), 'sys', { chat: async () => ({ ...resp([], 'refusal'), refusal: 'no' }), exec: ok, cancelled: () => false })
  assert.equal(refused.stop, 'refused')
  assert.equal(refused.error, 'no')
  const failed = await runAgent(state(), 'sys', {
    chat: async () => {
      throw new Error('every AI provider failed')
    },
    exec: ok,
    cancelled: () => false,
  })
  assert.equal(failed.stop, 'error')
})
