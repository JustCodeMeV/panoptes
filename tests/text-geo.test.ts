import assert from 'node:assert/strict'
import { test } from 'node:test'
import { geolocate, geolocateAvoiding } from '../server/geo/gazetteer.ts'
import { overlap } from '../server/core/xref.ts'
import { searchTerms, tokenSet, tokens } from '../server/truth/text.ts'

test('tokens drop stopwords, fold accents, light stem', () => {
  assert.deepEqual(tokens('The Missiles struck Kyiv'), ['missile', 'struck', 'kyiv'])
  assert.ok(tokenSet('Café Zürich').has('cafe'))
})

test('searchTerms prefers proper nouns', () => {
  assert.equal(searchTerms('Protests erupt in Madrid over housing', 2)[0], 'madrid')
})

test('gazetteer: specific site beats city beats country', () => {
  assert.equal(geolocate('Thousands march on Plaza de Cibeles in Madrid, Spain')?.name, 'Plaza de Cibeles')
  assert.equal(geolocate('Protest in Madrid, Spain')?.name, 'Madrid')
  assert.equal(geolocate('Unrest across Spain')?.name, 'Spain')
  assert.equal(geolocate('nothing geographic here'), null)
})

test('gazetteer: short aliases are case-sensitive and word-bounded', () => {
  assert.equal(geolocate('the plural of cola'), null)
  assert.equal(geolocate('UK economy')?.name, 'United Kingdom')
})

test('geolocateAvoiding: "US invade Iran" is about Iran', () => {
  assert.equal(geolocateAvoiding(['United States'], 'Will the U.S. invade Iran?')?.name, 'Iran')
  assert.equal(geolocateAvoiding(['United States'], 'US election')?.name, 'United States') // fallback
})

test('overlap needs two strong shared tokens', () => {
  assert.equal(overlap(tokenSet('war ukraine'), tokenSet('korea ukraine war')), 0) // "war" is 3 chars: only 1 strong
  assert.ok(overlap(tokenSet('saudi arabia yemen strike'), tokenSet('Saudi Arabia military action against Yemen')) >= 0.5)
  assert.equal(overlap(tokenSet('oil barrels release'), tokenSet('Will the war in Ukraine end')), 0)
})
