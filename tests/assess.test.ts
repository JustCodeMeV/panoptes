import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assess } from '../server/truth/assess.ts'
import type { Coverage, FactCheckMatch, Signal } from '../shared/truth.ts'

const sig = (platform: string, region: string): Signal => ({ platform, region, text: 't', at: new Date().toISOString() })
const cov = (o: Partial<Coverage>): Coverage => ({ query: 'q', window: '24h', total: 1, domains: 1, countries: [], establishedOutlets: [], stateOutlets: [], articles: [], ...o })
const fc = (verdict: FactCheckMatch['verdict'], score: number): FactCheckMatch => ({ publisher: 'P', title: 't', url: 'u', verdict, score })

test('strong false fact-check => debunked', () => {
  const a = assess({ signals: [sig('news', 'a')], factChecks: [fc('false', 0.9)], coverage: null })
  assert.equal(a.verdict, 'debunked')
})

test('weak fact-check match does not decide the verdict', () => {
  const a = assess({ signals: [sig('news', 'a')], factChecks: [fc('false', 0.5)], coverage: cov({}) })
  assert.notEqual(a.verdict, 'debunked')
})

test('two established outlets => corroborated', () => {
  const a = assess({ signals: [sig('news', 'a')], factChecks: [], coverage: cov({ establishedOutlets: ['bbc.com', 'dw.com'], domains: 2 }) })
  assert.equal(a.verdict, 'corroborated')
})

test('state-only coverage is flagged and raises attention', () => {
  const base = assess({ signals: [sig('news', 'a'), sig('news', 'b')], factChecks: [], coverage: cov({ domains: 2 }) })
  const state = assess({ signals: [sig('news', 'a'), sig('news', 'b')], factChecks: [], coverage: cov({ domains: 2, stateOutlets: ['rt.com'] }) })
  assert.equal(state.verdict, 'unverified')
  assert.ok(state.reasons.some((r) => /government-funded/.test(r)))
  assert.ok(state.risk > base.risk)
})

test('deep real-money market above 50% on a thin story bumps attention; play money does not', () => {
  const m = (playMoney: boolean) => ({ id: 'm', platform: 'polymarket' as const, title: 'T', headline: 'Yes', p: 0.7, volume: 1e6, unit: 'usd' as const, playMoney, trust: 80 })
  const input = { signals: [sig('news', 'a'), sig('news', 'b')], factChecks: [], coverage: cov({ domains: 2 }) }
  const none = assess(input)
  const real = assess({ ...input, markets: [m(false)] })
  const play = assess({ ...input, markets: [m(true)] })
  assert.ok(real.risk > none.risk)
  assert.equal(play.risk, none.risk)
})

test('mastodon instances and bluesky count as one spread feed each', () => {
  const a = assess({ signals: [sig('mastodon', 'x.social'), sig('mastodon', 'y.online'), sig('bluesky', 'bsky:a'), sig('bluesky', 'bsky:b')], factChecks: [], coverage: null })
  assert.equal(a.spread, 2)
})

test('risk stays within 0..100', () => {
  const a = assess({ signals: Array.from({ length: 30 }, (_, i) => ({ ...sig('news', `d${i}`), volume: 1e9 })), factChecks: [fc('false', 1)], coverage: cov({ stateOutlets: ['rt.com'] }) })
  assert.ok(a.risk >= 0 && a.risk <= 100)
})
