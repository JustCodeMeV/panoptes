import assert from 'node:assert/strict'
import { test } from 'node:test'

test('shared Google Trends client: serialized, cached, pauses on 429 and serves stale', async () => {
  const calls: string[] = []
  let status = 200
  const real = globalThis.fetch
  globalThis.fetch = (async (u: string) => {
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
