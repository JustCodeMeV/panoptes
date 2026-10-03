import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Feature } from '../shared/feature.ts'
import { backoffMs, loadLayer } from '../server/core/aggregate.ts'
import type { Provider } from '../server/core/provider.ts'

const feat = (id: string): Feature => ({ id, layerId: 'x', title: id, geoPrecision: 'none', observedAt: '', source: { provider: 'p', platform: 'p', retrievedAt: '' }, tags: [], props: {} })

test('backoff grows exponentially, is longer for 429/403, and is capped', () => {
  assert.equal(backoffMs(1, 60_000, 500), 60_000)
  assert.equal(backoffMs(2, 60_000, 500), 120_000)
  assert.equal(backoffMs(1, 60_000, 429), 300_000)
  assert.equal(backoffMs(20, 60_000, 429), 30 * 60_000)
})

test('a provider is called once per TTL however many layer loads happen', async () => {
  let calls = 0
  const p: Provider = { id: 'ttl-test', layerId: 'a', ttlMs: 60_000, async fetch() { return (calls++, [feat('a:1')]) } }
  await loadLayer('ttl-a1', [p])
  await loadLayer('ttl-a2', [p])
  await loadLayer('ttl-a3', [p])
  assert.equal(calls, 1)
})

test('missing keys: provider is off and never called', async () => {
  let calls = 0
  delete process.env.PANOPTES_TEST_KEY
  const p: Provider = { id: 'key-test', layerId: 'b', requires: ['PANOPTES_TEST_KEY'], async fetch() { return (calls++, []) } }
  const r = await loadLayer('key-b', [p])
  assert.equal(calls, 0)
  assert.equal(r.providers[0].error, 'no PANOPTES_TEST_KEY')
})

test('after a failure the last good data is served as stale, and the source is not hammered', async () => {
  let calls = 0
  let fail = false
  const p: Provider = { id: 'stale-test', layerId: 'c', ttlMs: 1, async fetch() { calls++; if (fail) throw new Error('HTTP 429 example.org'); return [feat('c:1')] } }
  await loadLayer('stale-c1', [p])
  fail = true
  await new Promise((r) => setTimeout(r, 5))
  await loadLayer('stale-c2', [p]) // triggers the failing refresh in the background
  await new Promise((r) => setTimeout(r, 5))
  const r = await loadLayer('stale-c3', [p])
  assert.equal(r.features.length, 1)
  assert.equal(r.providers[0].ok, true)
  assert.equal(r.providers[0].stale, true)
  assert.match(r.providers[0].error ?? '', /HTTP 429.*showing data from/)
  await loadLayer('stale-c4', [p])
  assert.equal(calls, 2) // backing off: no third request
})
