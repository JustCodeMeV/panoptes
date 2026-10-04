import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Feature } from '../shared/feature.ts'
import { buildPrompt, parseCheck } from '../server/x/grok.ts'
import { worthChecking } from '../server/x/engine.ts'

const story = (verdict: string, risk: number, extra: Record<string, unknown> = {}): Feature => ({
  id: 'news:1',
  layerId: 'news',
  title: 'Explosion reported at port near Bandar Abbas',
  position: { lat: 27.18, lon: 56.27 },
  geoPrecision: 'inferred',
  geoBasis: 'story mentions "Bandar Abbas"',
  observedAt: '2026-10-04T01:00:00.000Z',
  source: { provider: 'news', platform: 'news', retrievedAt: '2026-10-04T01:00:00.000Z' },
  tags: [],
  props: { assessment: { verdict, risk, reasons: ['only state outlets so far'], factChecks: [], coverage: null, signals: [], spread: 2 }, items: 2, outlets: 1, social: 1, ...extra },
})

test('only unsettled stories with traction are sent to X', () => {
  assert.equal(worthChecking(story('unverified', 70)), true)
  assert.equal(worthChecking(story('disputed', 10, { items: 6, outlets: 3, social: 2 })), true)
  assert.equal(worthChecking(story('unverified', 10)), false) // no traction yet
  assert.equal(worthChecking(story('corroborated', 90)), false) // already settled
  assert.equal(worthChecking(story('debunked', 90)), false)
})

test('the prompt carries what Argus already knows', () => {
  const p = buildPrompt(story('unverified', 70))
  assert.match(p, /Bandar Abbas/)
  assert.match(p, /Our current verdict: unverified/)
  assert.match(p, /last 72 hours/)
})

test("Grok's reply is parsed defensively", () => {
  const reply = '```json\n{"verdict":"disputed","confidence":140,"summary":"Footage is from 2023.","details":["@geoconfirmed matched the video to a 2023 fire"],"discrepancies":[],"location":{"name":"Bandar Abbas","lat":27.18,"lon":56.27},"posts":[{"url":"https://x.com/a/status/1","handle":"@a","stance":"contradicts","text":"Old video"},{"url":"https://evil.example/x","stance":"supports","text":"not X"}]}\n```'
  const c = parseCheck(reply, ['https://x.com/a/status/1', 'javascript:alert(1)'])!
  assert.equal(c.verdict, 'disputed')
  assert.equal(c.confidence, 100) // clamped
  assert.equal(c.posts.length, 1) // non-X links dropped
  assert.deepEqual(c.citations, ['https://x.com/a/status/1'])
  assert.equal(c.location?.name, 'Bandar Abbas')
  assert.equal(parseCheck('No JSON here'), null)
  assert.equal(parseCheck('{"verdict":"maybe","summary":"x"}'), null)
})
