import assert from 'node:assert/strict'
import { test } from 'node:test'

test('a layer with refreshMs 0 is fetched once, never polled (setInterval(fn, 0) flooded the API ~100×/s)', async () => {
  const { pollEvery } = await import('../src/core/useLayerData.ts')
  assert.equal(pollEvery({ refreshMs: 0 }), null)
  assert.equal(pollEvery({ refreshMs: 60_000 }), 60_000)
})

test('no polled layer refetches faster than once a second; the client-only atlas is not polled', async () => {
  const { pollEvery } = await import('../src/core/useLayerData.ts')
  const { LAYERS } = await import('../src/layers/index.ts')
  for (const def of LAYERS.filter((l) => !l.stream)) {
    const every = pollEvery(def)
    assert.ok(every === null || every >= 1000, `${def.id} polls every ${every} ms`)
  }
  assert.equal(pollEvery(LAYERS.find((l) => l.id === 'atlas')!), null)
})
