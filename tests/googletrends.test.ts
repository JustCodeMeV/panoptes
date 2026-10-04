import assert from 'node:assert/strict'
import { test } from 'node:test'

test('shared Google Trends client: serialized, cached, pauses on 429 and serves stale', async () => {
  const calls: string[] = []
  let status = 200
  const real = globalThis.fetch
  globalThis.fetch = (async (u: string) => {
    if (!String(u).includes('trends.google.com')) return new Response('no relay', { status: 404 }) // relay down: direct path
    calls.push(String(u))
    return new Response(status === 200 ? '<rss><channel><item><title>x</title></item></channel></rss>' : 'slow down', { status })
  }) as typeof fetch
  try {
    const g = await import('../server/core/googletrends.ts')
    const [a, b] = await Promise.all([g.trendingRss('FR'), g.trendingRss('FR')])
    assert.equal(a, b)
    assert.equal(calls.length, 1) // concurrent callers share one request
    assert.ok(g.cached('FR'))
    await g.trendingRss('FR')
    assert.equal(calls.length, 1) // cached within TTL
    status = 429
    await assert.rejects(g.trendingRss('DE'), /429/)
    assert.match(g.trendsError() ?? '', /pausing/)
  } finally {
    globalThis.fetch = real
  }
})

test('trends relay: cache filled from the relay file, Google not called', async () => {
  const calls: string[] = []
  const real = globalThis.fetch
  process.env.TRENDS_RELAY_URL = 'https://relay.test/trends.json'
  globalThis.fetch = (async (u: string) => {
    calls.push(String(u))
    if (String(u).startsWith('https://relay.test/'))
      return Response.json({ fetchedAt: new Date().toISOString(), feeds: { JP: { xml: '<rss>relayed</rss>', at: Date.now() - 60_000 } } })
    return new Response('blocked', { status: 429 })
  }) as typeof fetch
  try {
    const g = await import(`../server/core/googletrends.ts?relay=${Date.now()}`)
    assert.equal(await g.trendingRss('JP'), '<rss>relayed</rss>')
    assert.equal(g.cached('JP')?.via, 'relay')
    assert.ok(calls.every((u) => !u.includes('trends.google.com')))
    assert.equal(g.trendsSource().relayFresh, true)
  } finally {
    globalThis.fetch = real
    delete process.env.TRENDS_RELAY_URL
  }
})
