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

test('firms: high-power, non-low-confidence detections only; bad responses throw', async () => {
  const { parseFirms } = await import('../server/providers/osint/firms.ts')
  const csv = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n' +
    '48.1,37.8,340,0.4,0.4,2026-10-03,0112,N,VIIRS,n,2.0NRT,290,55.2,N\n' +
    '48.2,37.9,320,0.4,0.4,2026-10-03,0112,N,VIIRS,l,2.0NRT,290,80,N\n' +
    '48.3,37.7,310,0.4,0.4,2026-10-03,0112,N,VIIRS,h,2.0NRT,290,4,N\n'
  const fs = parseFirms(csv, 'Ukraine')
  assert.equal(fs.length, 1)
  assert.equal(fs[0].props.severity, 'high')
  assert.equal(fs[0].observedAt, '2026-10-03T01:12:00Z')
  assert.throws(() => parseFirms('Invalid MAP_KEY.', 'x'), /FIRMS: Invalid MAP_KEY/)
})

test('acled: precision 1 is exact, coarser is approximate; fatalities kept', async () => {
  const { toFeature: acled } = await import('../server/providers/acled/acled.ts')
  const base = { event_id_cnty: 'UKR1', event_date: '2026-10-01', event_type: 'Battles', sub_event_type: 'Armed clash', actor1: 'A', country: 'Ukraine', location: 'Pokrovsk', latitude: '48.28', longitude: '37.18', fatalities: '3' }
  assert.equal(acled({ ...base, geo_precision: '1' }).geoPrecision, 'exact')
  const f = acled({ ...base, geo_precision: '3' })
  assert.equal(f.geoPrecision, 'approximate')
  assert.equal(f.props.fatalities, 3)
  FeatureSchema.parse(f)
})
