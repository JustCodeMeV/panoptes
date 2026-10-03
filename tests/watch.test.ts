import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Feature } from '../shared/feature.ts'
import type { LiveEvent } from '../shared/live.ts'
import { createWatch } from '../server/cases/db.ts'
import { subscribe } from '../server/core/hub.ts'
import { consider, haversineKm, matchWatches, reloadWatches, snapshot } from '../server/watch/engine.ts'

const feat = (id: string, lat: number, lon: number, layerId = 'news'): Feature => ({
  id, layerId, title: id, position: { lat, lon }, geoPrecision: 'inferred', observedAt: '', source: { provider: 'p', platform: 'p', retrievedAt: '' }, tags: [], props: {},
})
const W = { id: 1, name: 'Hormuz', lat: 26.6, lon: 56.3, radiusKm: 150, layers: [] as string[], created: '' }

test('haversine: Kyiv to Moscow is ~755 km', () => {
  const d = haversineKm({ lat: 50.45, lon: 30.52 }, { lat: 55.75, lon: 37.62 })
  assert.ok(Math.abs(d - 755) < 10, String(d))
})

test('match respects radius and layer filter; placeless features never match', () => {
  assert.equal(matchWatches(feat('a', 26.2, 56.5), [W]).length, 1)
  assert.equal(matchWatches(feat('b', 30, 56.3), [W]).length, 0)
  assert.equal(matchWatches(feat('c', 26.2, 56.5, 'osint'), [{ ...W, layers: ['news'] }]).length, 0)
  assert.equal(matchWatches(feat('e', 26.2, 56.5, 'livestreams'), [W]).length, 0)
  assert.equal(matchWatches({ ...feat('d', 0, 0), position: undefined }, [W]).length, 0)
})

test('new arrivals alert once; sweeps do not repeat; stream updates re-fire; baseline is silent', async () => {
  const events: LiveEvent[] = []
  subscribe('watch', (e) => events.push(e))
  createWatch({ name: 'Hormuz', lat: 26.6, lon: 56.3, radiusKm: 150, layers: [] })
  await reloadWatches({})
  consider(feat('news:old', 26.5, 56.2), { silent: true })
  consider(feat('news:old', 26.5, 56.2))
  assert.equal(events.length, 0)
  assert.equal(snapshot().features.length, 0)

  consider(feat('news:x', 26.4, 56.4))
  consider(feat('news:x', 26.4, 56.4))
  assert.equal(events.filter((e) => e.type === 'upsert').length, 1)
  consider(feat('news:x', 26.4, 56.4), { kind: 'update', change: 'unverified -> debunked' })
  const ups = events.filter((e) => e.type === 'upsert')
  assert.equal(ups.length, 2)
  assert.equal(ups[1].type === 'upsert' && ups[1].kind, 'update')
  assert.match(ups[1].type === 'upsert' ? (ups[1].change ?? '') : '', /Hormuz · \d+ km · unverified -> debunked/)
})
