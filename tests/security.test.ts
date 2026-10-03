import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { rateLimit } from '../server/core/ratelimit.ts'
import { redact } from '../server/core/secrets.ts'

test('redact: configured secret values, key patterns, bearer tokens and query-string keys', () => {
  process.env.ACLED_PASSWORD = 'hunter2-very-secret'
  assert.equal(redact('login failed for hunter2-very-secret'), 'login failed for [ACLED_PASSWORD]')
  assert.equal(redact('bad key sk-ant-api03-abcdefghijklmnop'), 'bad key [redacted]')
  assert.equal(redact('Authorization: Bearer abcdefghijklmnopqrstuvwxyz'), 'Authorization: Bearer [redacted]')
  assert.equal(redact('GET https://x.org/v1?q=a&key=AbCdEf123&n=1'), 'GET https://x.org/v1?q=a&key=[redacted]&n=1')
  assert.equal(redact('HTTP 429 api.adsb.lol'), 'HTTP 429 api.adsb.lol')
  delete process.env.ACLED_PASSWORD
})

test('rate limit: per IP, 429 with retry-after once exceeded', async () => {
  const app = new Hono()
  app.use('/x', rateLimit({ windowMs: 60_000, max: 2, name: 'tests' }))
  app.get('/x', (c) => c.text('ok'))
  const hit = (ip: string) => app.request('/x', { headers: { 'x-forwarded-for': ip } })
  assert.equal((await hit('1.1.1.1')).status, 200)
  assert.equal((await hit('1.1.1.1')).status, 200)
  const r = await hit('1.1.1.1')
  assert.equal(r.status, 429)
  assert.ok(Number(r.headers.get('retry-after')) > 0)
  assert.equal((await hit('2.2.2.2')).status, 200)
})
