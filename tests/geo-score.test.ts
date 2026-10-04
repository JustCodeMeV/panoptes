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

test('outlet registry: one rule for every bloc', async () => {
  const { establishedOutlet, stateOutlet, stateBloc, outletCountry } = await import('../server/truth/domains.ts')
  // Government-funded outlets are "state" whichever government pays for them.
  for (const [d, bloc] of [['voanews.com', 'US'], ['rferl.org', 'US'], ['rt.com', 'RU'], ['news.cn', 'CN'], ['aljazeera.com', 'QA'], ['aa.com.tr', 'TR'], ['ukrinform.net', 'UA']] as const) {
    assert.equal(stateOutlet(d), d, d)
    assert.equal(stateBloc(d), bloc, d)
    assert.equal(establishedOutlet(d), undefined, d)
  }
  // Independent newsrooms and public-service broadcasters from anywhere count as independent coverage.
  for (const d of ['reuters.com', 'bbc.co.uk', 'dawn.com', 'thehindu.com', 'dailymaverick.co.za', 'meduza.io', 'premiumtimesng.com']) assert.equal(establishedOutlet(d), d, d)
  assert.equal(outletCountry('dawn.com'), 'PK')
  // Official channels of every side carry their government's bloc.
  assert.equal(stateBloc('t.me/idfofficial'), 'IL')
  assert.equal(stateBloc('t.me/kpszsu'), 'UA')
  assert.equal(stateBloc('t.me/mod_russia_en'), 'RU')
})

test('corroboration needs independent outlets from more than one country', async () => {
  const { assess } = await import('../server/truth/assess.ts')
  const cov = (domains: string[]) => ({ query: 'q', window: '24h', total: domains.length, domains: domains.length, countries: [], establishedOutlets: domains, stateOutlets: [], articles: [] })
  assert.equal(assess({ signals: [], factChecks: [], coverage: cov(['nytimes.com', 'cnn.com']) }).verdict, 'unverified') // one national press
  assert.equal(assess({ signals: [], factChecks: [], coverage: cov(['nytimes.com', 'dawn.com']) }).verdict, 'corroborated')
})
