import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countryOf, geolocate, scoreLocations } from '../server/geo/gazetteer.ts'
import { similar } from '../server/news/engine.ts'
import { tokenSet } from '../server/truth/text.ts'

test('scorer: the country a headline is about beats a passing mention', () => {
  assert.equal(geolocate('Italy’s Ustica enigma: Can French files solve mystery crash blamed on stray missile?')?.name, 'Italy')
  assert.equal(geolocate('Paris witnesses protests before Argentine President Milei’s visit')?.name, 'Paris')
})

test('scorer: every country is known, demonyms count', () => {
  assert.equal(geolocate('Ugandan police arrest opposition supporters ahead of vote')?.name, 'Uganda')
  assert.equal(geolocate('Rwanda and Burundi trade accusations')?.country, 'Rwanda')
})

test('scorer: outlet names and longer names do not leak a location', () => {
  assert.equal(geolocate('FRANCE 24 English - Live'), null)
  assert.equal(geolocate('Clashes in South Sudan leave dozens dead')?.name, 'South Sudan')
  const r = scoreLocations([
    { text: 'Uganda opposition leader detained', weight: 3 },
    { text: 'Paris-based RSF and France 24 report the arrest in Kampala', weight: 1 },
  ])
  assert.equal(r?.country, 'Uganda')
})

test('places belong to the country they sit in', () => {
  assert.equal(countryOf('Kyiv'), 'Ukraine')
  assert.equal(countryOf('Mumbai'), 'India')
  assert.equal(countryOf('Sevastopol'), 'Ukraine')
  assert.equal(countryOf('Strait of Hormuz'), undefined)
})

test('clustering needs a distinctive shared word', () => {
  assert.ok(!similar(tokenSet('Police clash with protesters in Kampala'), tokenSet('Police clash with protesters in Paris')))
  assert.ok(similar(tokenSet('Bobi Wine arrested in Kampala'), tokenSet('Bobi Wine arrested after Kampala rally')))
})
