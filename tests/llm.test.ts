import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyJudgement, briefFor } from '../server/llm/analysis.ts'
import { llmEnabled, llmStatus, memo, structured } from '../server/llm/client.ts'
import { assess } from '../server/truth/assess.ts'
import type { FactCheckMatch } from '../shared/truth.ts'
import { z } from 'zod/v4'

delete process.env.ANTHROPIC_API_KEY
const fc = (url: string, score: number, verdict: FactCheckMatch['verdict'] = 'false'): FactCheckMatch => ({ publisher: 'P', title: url, url, verdict, score })

test('without a key the LLM is a silent no-op', async () => {
  assert.equal(llmEnabled(), false)
  assert.equal(await structured({ system: 's', prompt: 'p', schema: z.object({ a: z.string() }) }), null)
  assert.match(llmStatus().error ?? '', /no ANTHROPIC_API_KEY/)
  const f = { id: 'news:x', layerId: 'news', title: 't', geoPrecision: 'none' as const, observedAt: '', source: { provider: 'p', platform: 'p', retrievedAt: '' }, tags: [], props: { assessment: assess({ signals: [], factChecks: [], coverage: null }) } }
  assert.equal(await briefFor(f), null)
})

test('judgement: same => strong, related => weak, unrelated => dropped', () => {
  const out = applyJudgement([fc('a', 0.3), fc('b', 0.7), fc('c', 0.5)], [
    { index: 0, relation: 'same' },
    { index: 1, relation: 'related' },
    { index: 2, relation: 'unrelated' },
  ])
  assert.deepEqual(out.map((m) => [m.url, m.judged]), [['a', 'same'], ['b', 'related']])
  assert.equal(out[0].score, 0.8)
  assert.ok(out[1].score <= 0.5)
})

test('an AI-judged "same" false check debunks, a "related" one does not', () => {
  const [same] = applyJudgement([fc('a', 0.3)], [{ index: 0, relation: 'same' }])
  assert.equal(assess({ signals: [], factChecks: [same], coverage: null }).verdict, 'debunked')
  const [rel] = applyJudgement([fc('b', 0.9)], [{ index: 0, relation: 'related' }])
  assert.notEqual(assess({ signals: [], factChecks: [rel], coverage: null }).verdict, 'debunked')
})

test('memo shares in-flight calls and does not cache failures', async () => {
  const m = memo<number>()
  let n = 0
  const fn = async () => ++n
  const [a, b] = await Promise.all([m('k', fn), m('k', fn)])
  assert.equal(a, 1)
  assert.equal(b, 1)
  let fails = 0
  await m('f', async () => (fails++, null))
  await m('f', async () => (fails++, null))
  assert.equal(fails, 2)
})
