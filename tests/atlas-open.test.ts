import assert from 'node:assert/strict'
import { test } from 'node:test'

test('countries open with their outline; small states without one (Bahrain) open as a point', async () => {
  const { countryFeature } = await import('../src/core/atlas.ts')
  const france = countryFeature('France')!
  assert.equal(france.geometry?.type, 'MultiPolygon')
  const bahrain = countryFeature('Bahrain', { at: { lat: 26.07, lon: 50.56 } })!
  assert.equal(bahrain.geometry, undefined)
  assert.deepEqual(bahrain.position, { lat: 26.07, lon: 50.56 })
  // Opened from a profile chip (no position known): still opens, placeless
  assert.equal(countryFeature('Malta')!.geoPrecision, 'none')
  // Map-mode tints need an outline: those are skipped
  assert.equal(countryFeature('Bahrain', { role: 'ally', id: 'atlas-lens:ally:Bahrain' }), null)
})

test('openCountry swaps the open country: one at a time, small states included', async () => {
  const { openCountry } = await import('../src/core/atlas.ts')
  const { useStore } = await import('../src/core/store.ts')
  await openCountry('France')
  assert.equal(useStore.getState().selectedId, 'atlas:France')
  await openCountry('Bahrain', { lat: 26.07, lon: 50.56 })
  assert.equal(useStore.getState().selectedId, 'atlas:Bahrain')
  assert.deepEqual(
    useStore.getState().layers.atlas.pinned.map((f) => f.id),
    ['atlas:Bahrain'],
  )
})
