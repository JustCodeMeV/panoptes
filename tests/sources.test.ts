import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classify } from '../server/providers/frontlines/deepstate.ts'
import { parseGpsjam } from '../server/providers/gnss/gpsjam.ts'
import { toFeature } from '../server/providers/military/adsblol.ts'
import { FeatureSchema } from '../shared/feature.ts'

test('gpsjam: keeps only cells with >10% affected aircraft and >=3 aircraft; valid hex polygons', () => {
  const csv = 'hex,count_good_aircraft,count_bad_aircraft\n841f05bffffffff,5,5\n841f059ffffffff,9,1\n841f05dffffffff,1,1\n'
  const fs = parseGpsjam(csv, '2026-10-02')
  assert.equal(fs.length, 1)
  const f = FeatureSchema.parse(fs[0])
  assert.equal(f.geometry?.type, 'Polygon')
  const ring = f.geometry!.type === 'Polygon' ? f.geometry!.coordinates[0] : []
  assert.equal(ring.length, 7) // hexagon, closed
  assert.equal(f.props.share, 0.5)
})

test('deepstate: occupied/contested kept, editorial claims skipped', () => {
  assert.equal(classify('Окуповано /// Occupied /// geoJSON.status.occupied')?.status, 'occupied')
  assert.equal(classify('x /// Occupied Crimea /// y')?.status, 'occupied')
  assert.equal(classify('x /// Unknown status /// y')?.status, 'contested')
  assert.equal(classify('x /// The temporarily occupied territory of Karelia. /// y'), null)
  assert.equal(classify('x /// Liberated 23.03 /// y'), null)
})

test('adsb: positions are exact; stale or positionless aircraft dropped; emergency squawk flagged', () => {
  assert.equal(toFeature({ hex: 'a' }), null)
  assert.equal(toFeature({ hex: 'a', lat: 1, lon: 2, seen_pos: 600 }), null)
  const f = toFeature({ hex: 'ae1234', flight: 'RCH123 ', t: 'C17', lat: 50, lon: 30, alt_baro: 31000, squawk: '7700' })!
  assert.equal(f.geoPrecision, 'exact')
  assert.equal(f.props.squawk, '7700')
  assert.match(f.title, /RCH123 · C17/)
})
