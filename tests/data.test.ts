import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gate, locateMarket } from '../server/markets/gate.ts'
import { trust } from '../server/markets/engine.ts'
import type { RawMarket } from '../server/markets/types.ts'
import { parseExport, stamp, parseStamp } from '../server/unrest/gdelt.ts'
import { titleFromUrl } from '../server/unrest/engine.ts'
import { matchFactChecks, type Corpus } from '../server/truth/factchecks.ts'
import { tokenSet } from '../server/truth/text.ts'

const mk = (o: Partial<RawMarket>): RawMarket => ({ id: 'x', platform: 'polymarket', title: 't', headline: 'Yes', url: '', p: 0.5, volume24h: 0, volumeTotal: 0, unit: 'usd', playMoney: false, outcomes: [], ref: {}, text: '', ...o })

test('market gate: security passes, sport/celebrity/US-election/local races do not', () => {
  assert.ok(gate('Will the U.S. invade Iran before 2027?', 'Will the U.S. invade Iran before 2027?').pass)
  assert.ok(!gate('Will the Lakers win the NBA title', 'Will the Lakers win the NBA title').pass)
  assert.ok(!gate('Will Natalie Portman return to Star Wars', 'Will Natalie Portman return to Star Wars').pass)
  assert.ok(gate('Brazil Presidential Election', 'Brazil Presidential Election').pass)
  assert.ok(!gate('US Presidential Election 2028', 'US Presidential Election 2028').pass)
  assert.ok(!gate('Taipei Mayor Election Winner', 'Taipei Mayor Election Winner').pass)
})

test('market location skips the US when another place is named', () => {
  assert.equal(locateMarket('Will the U.S. invade Iran?', 'Yes')?.name, 'Iran')
})

test('trust: depth drives it, play money is capped, monotonic in volume', () => {
  const thin = trust(mk({ volumeTotal: 2_000, volume24h: 50 }))
  const deep = trust(mk({ volumeTotal: 5_000_000, volume24h: 200_000 }))
  assert.ok(thin < 20 && deep > 70)
  assert.ok(trust(mk({ volumeTotal: 1e9, volume24h: 1e8, playMoney: true })) <= 20)
})

test('GDELT: stamp round-trip and export parsing keeps only city-level unrest rows', () => {
  assert.equal(stamp(new Date(parseStamp('20261003154500'))), '20261003154500')
  const row = (root: string, geoType: string) => {
    const c = Array<string>(61).fill('')
    c[0] = '1'; c[26] = '140'; c[28] = root; c[31] = '3'; c[32] = '2'; c[34] = '-2'; c[51] = geoType; c[52] = 'Tbilisi, Georgia'; c[53] = 'GG'; c[56] = '41.7'; c[57] = '44.8'; c[59] = '20261003154500'; c[60] = 'https://x.example/a-b-c'
    c[12] = 'MIL'
    return c.join('\t')
  }
  const ev = parseExport([row('14', '4'), row('14', '1'), row('04', '4'), row('19', '3')].join('\n'))
  assert.equal(ev.length, 2)
  assert.deepEqual(ev.map((e) => e.root), ['14', '19'])
})

test('GDELT relevance: entertainment, sport and local crime coded as violence are dropped', async () => {
  const { isRelevant } = await import('../server/unrest/gdelt.ts')
  const junk = [
    'https://www.womansworld.com/entertainment/books/5-most-read-horror-fiction-books-on-goodreads-right-now',
    'https://www.courant.com/2026/10/03/nurse-convicted-of-murder-in-high-speed-south-la-car-wreck-that-killed-six/',
    'https://www.howtogeek.com/new-netflix-shows-to-watch-in-october-2026/',
    'https://www.latimes.com/california/story/2026-10-03/culver-city-bus-shooting-victim-identified-suspect-arrested',
    'https://kotaku.com/troves-of-unseen-star-wars-material-emerge-online-after-effects-wizards-garage-sale',
    'https://www.hollywoodreporter.com/tv/annabelle-wallis-unabomber-netflix-1236',
    'https://sfist.com/2026/10/03/man-killed-in-shooting-on-market-street-outside-sfs-warfield-theatre/',
  ]
  for (const url of junk) assert.equal(isRelevant({ root: '19', url, actor1Type: 'GOV' }), false, url)
  const real = [
    'https://www.thehindu.com/news/international/yemen-houthis-say-they-attacked-aramco-facility-in-riyadh-with-missiles-drones/article1.ece',
    'https://example.org/2026/10/ethiopian-troops-retake-mekelle-airport',
    'https://example.org/hundreds-march-against-planned-detention-site-on-east-side',
  ]
  for (const url of real) assert.equal(isRelevant({ root: '19', url }), true, url)
  // No readable headline: only political/military actors (or a protest) make it count.
  assert.equal(isRelevant({ root: '19', url: 'https://www.eng.kavkaz-uzel.eu/articles/79097', actor1Type: 'COP' }), false)
  assert.equal(isRelevant({ root: '19', url: 'https://www.eng.kavkaz-uzel.eu/articles/79097', actor1Type: 'MIL' }), true)
})

test('titleFromUrl makes a readable headline from a slug', () => {
  assert.equal(titleFromUrl('https://x.com/news/2026/10/protesters-clash-with-police-in-tbilisi.html'), 'Protesters clash with police in tbilisi')
})

test('fact-check matching needs >=2 shared terms and a strong share', () => {
  const items = [{ publisher: 'LS', title: 'Video does NOT show protests in Iran', url: 'u1', summary: '', verdict: 'false' as const, tokens: tokenSet('Video does NOT show protests in Iran in Fall 2026') }]
  const corpus: Corpus = { items, idf: new Map(), feeds: [] }
  assert.equal(matchFactChecks(corpus, 'Video shows protests in Iran in fall 2026')[0]?.url, 'u1')
  assert.equal(matchFactChecks(corpus, 'Iran').length, 0)
  assert.equal(matchFactChecks(corpus, 'oil prices rise in Texas').length, 0)
})
