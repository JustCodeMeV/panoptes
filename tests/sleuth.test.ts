import assert from 'node:assert/strict'
import { test } from 'node:test'
import type Anthropic from '@anthropic-ai/sdk'
import { parseFinding, runAgent, type AgentState, type Deps } from '../server/sleuth/agent.ts'
import { cost } from '../server/sleuth/prices.ts'
import { imageKind } from '../server/sleuth/runs.ts'

type Msg = Anthropic.Beta.BetaMessage
const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } as Msg['usage']
const reply = (content: unknown[], stop: string): Msg => ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content, stop_reason: stop, usage }) as unknown as Msg
const toolUse = (id: string, script: string) => ({ type: 'tool_use', id, name: 'run_script', input: { script, args: ['rank'] } })
const final = 'Done.\n```json\n{"lat": 35.1, "lon": 139.2, "radius_m": 500, "place": "Somewhere", "level": "area", "confidence": "medium"}\n```'
const state = (over: Partial<AgentState> = {}): AgentState => ({
  model: 'claude-haiku-5-5', messages: [{ role: 'user', content: 'go' }], steps: [], toolCalls: 0, costUsd: 0, budget: { steps: 10, usd: 1 }, ...over,
})

test('cost: per-model rates, cache reads and writes, Haiku long-prompt rate', () => {
  // 1M in + 1M out on Sonnet 5.5 = $2 + $10
  assert.equal(cost('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }), 12)
  // cache write 1.25x, cache read $0.20 on Opus 5.5
  assert.equal(cost('claude-opus-5-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 }), 5 + 0.2)
  // Haiku 5.5: 5x above a 100K-token prompt
  const small = cost('claude-haiku-5-5', { input_tokens: 50_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })
  const big = cost('claude-haiku-5-5', { input_tokens: 150_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })
  assert.ok(Math.abs(small - 0.005) < 1e-9)
  assert.ok(Math.abs(big - 0.075) < 1e-9)
})

test('parseFinding: last JSON block, coordinates validated', () => {
  assert.deepEqual(parseFinding(final)?.lat, 35.1)
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
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = []
  const replies = [reply([toolUse('a', 'board'), toolUse('b', 'clues')], 'tool_use'), reply([{ type: 'text', text: final }], 'end_turn')]
  const ran: string[] = []
  const deps: Deps = {
    create: async (p) => (calls.push(structuredClone(p)), replies.shift()!),
    exec: async (_n, input) => (ran.push((input as { script: string }).script), { content: 'ok', isError: false, summary: 's' }),
    cancelled: () => false,
  }
  const s = await runAgent(state(), [], deps)
  assert.deepEqual(ran, ['board', 'clues'])
  assert.equal(s.stop, 'done')
  assert.equal(s.finding?.place, 'Somewhere')
  assert.equal(s.toolCalls, 2)
  // second request: [user, assistant, user(tool_result a, tool_result b, budget text)]
  const last = calls[1].messages.at(-1)!.content as Anthropic.Beta.BetaContentBlockParam[]
  assert.deepEqual(last.map((b) => b.type), ['tool_result', 'tool_result', 'text'])
  assert.deepEqual(calls[0].cache_control, { type: 'ephemeral' })
  assert.ok(s.costUsd > 0)
})

test('agent: budget reached → one last request without tools, then stop', async () => {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = []
  const deps: Deps = {
    create: async (p) => {
      calls.push(p)
      return p.tool_choice?.type === 'none' ? reply([{ type: 'text', text: final }], 'end_turn') : reply([toolUse(`t${calls.length}`, 'osm')], 'tool_use')
    },
    exec: async () => ({ content: 'ok', isError: false, summary: 's' }),
    cancelled: () => false,
  }
  const s = await runAgent(state({ budget: { steps: 3, usd: 1 } }), [], deps)
  assert.equal(s.toolCalls, 3)
  assert.equal(s.stop, 'budget')
  assert.equal(calls.at(-1)!.tool_choice?.type, 'none')
  assert.equal(calls.length, 4)
})

test('agent: dollar cap stops the loop too', async () => {
  let n = 0
  const deps: Deps = {
    create: async (p) => (n++, p.tool_choice?.type === 'none' ? reply([{ type: 'text', text: 'stopped' }], 'end_turn') : reply([toolUse(`t${n}`, 'osm')], 'tool_use')),
    exec: async () => ({ content: 'ok', isError: false, summary: 's' }),
    cancelled: () => false,
  }
  // each reply costs 1000 in + 500 out on Haiku 5.5 = $0.00035
  const s = await runAgent(state({ budget: { steps: 100, usd: 0.001 } }), [], deps)
  assert.equal(s.stop, 'budget')
  assert.ok(n <= 5)
  assert.equal(s.finding, undefined)
})

test('agent: refusal and API errors end the run with a reason', async () => {
  const refused = await runAgent(state(), [], {
    create: async () => ({ ...reply([], 'refusal'), stop_details: { type: 'refusal', category: null, explanation: 'no' } }) as unknown as Msg,
    exec: async () => ({ content: '', isError: false, summary: '' }),
    cancelled: () => false,
  })
  assert.equal(refused.stop, 'refused')
  const failed = await runAgent(state(), [], {
    create: async () => {
      throw new Error('boom')
    },
    exec: async () => ({ content: '', isError: false, summary: '' }),
    cancelled: () => false,
  })
  assert.equal(failed.stop, 'error')
  assert.equal(failed.error, 'boom')
})
