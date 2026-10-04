import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignOf, classOf, similar, type Story } from '../server/news/engine.ts'
import type { NewsItem } from '../server/news/ingest.ts'
import { tokenSet } from '../server/truth/text.ts'

const MIN = 60_000
const t0 = Date.now() - 4 * 3600_000
let n = 0
const item = (domain: string, minAfter: number, title = 'Saudi airstrikes hit Sanaa'): NewsItem => ({
  id: String(n++), feedId: 'f', title, summary: '', url: `https://${domain}/${n}`, domain, published: t0 + minAfter * MIN,
})
const story = (items: NewsItem[]): Story => ({ id: 's', items, tokens: items.map((i) => tokenSet(i.title)), sig: '', verdict: '', flags: '' })

test('classification', () => {
  assert.equal(classOf('bbc.co.uk'), 'established')
  assert.equal(classOf('tass.com'), 'state')
  assert.equal(classOf('t.me/clashreport'), 'social')
  assert.equal(classOf('bsky:someone.bsky.social'), 'social')
  assert.equal(classOf('randomblog.example'), 'other')
})

test('story clustering: same event joins, different event does not', () => {
  const a = tokenSet('Saudi airstrikes intensify as Yemeni army advances toward Taiz')
  assert.ok(similar(a, tokenSet('Saudi airstrikes hit Taiz as Yemeni forces advance')))
  assert.ok(!similar(a, tokenSet('G7 to release 100 million barrels of oil')))
})

test('state-first: state media 90 min before first established outlet', () => {
  const c = campaignOf(story([item('tass.com', 0), item('bbc.co.uk', 90)]), false, false)
  assert.ok(c.flags.some((f) => f.id === 'state-first'))
  assert.equal(c.stateLeadMin, 90)
})

test('no state-first flag when the lead is short', () => {
  const c = campaignOf(story([item('tass.com', 0), item('bbc.co.uk', 10)]), false, false)
  assert.ok(!c.flags.some((f) => f.id === 'state-first'))
})

test('several governments pushing a story is flagged the same way for every bloc', () => {
  const ruIr = campaignOf(story([item('tass.com', 0), item('presstv.ir', 5)]), false, false)
  assert.equal(ruIr.flags.find((x) => x.id === 'multi-bloc')?.severity, 'warn')
  assert.deepEqual(ruIr.blocs.sort(), ['IR', 'RU'])
  const usUa = campaignOf(story([item('voanews.com', 0), item('ukrinform.net', 5)]), false, false)
  assert.equal(usUa.flags.find((x) => x.id === 'multi-bloc')?.severity, 'warn')
  assert.deepEqual(usUa.blocs.sort(), ['UA', 'US'])
  const three = campaignOf(story([item('voanews.com', 0), item('aljazeera.com', 3), item('rt.com', 5)]), false, false)
  assert.equal(three.flags.find((x) => x.id === 'multi-bloc')?.severity, 'alert')
})

test('widely corroborated stories raise no spread flags', () => {
  const c = campaignOf(story([item('tass.com', 0), item('presstv.ir', 5), item('bbc.co.uk', 10), item('dw.com', 12), item('theguardian.com', 15)]), false, false)
  assert.equal(c.flags.length, 0)
})

test('social surge needs 3 distinct accounts', () => {
  const two = campaignOf(story([item('t.me/a', 0), item('t.me/b', 1)]), false, false)
  const three = campaignOf(story([item('t.me/a', 0), item('t.me/b', 1), item('bsky:c', 2)]), false, false)
  assert.ok(!two.flags.some((f) => f.id === 'social-surge'))
  assert.ok(three.flags.some((f) => f.id === 'social-surge'))
})

test('contradicted + market flags contribute to the score and it is capped', () => {
  const c = campaignOf(story([item('tass.com', 0), item('presstv.ir', 5)]), true, true)
  assert.ok(c.flags.some((f) => f.id === 'contradicted') && c.flags.some((f) => f.id === 'market'))
  assert.ok(c.score <= 100 && c.score >= 70)
})
