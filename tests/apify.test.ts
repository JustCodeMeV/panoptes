import assert from 'node:assert/strict'
import { test } from 'node:test'

test('Apify: off without a token, and refuses runs once the budget is spent (no network call)', async () => {
  const { socialSearch, BUDGET_USD } = await import('../server/social/apify.ts')
  const { logApifySpend } = await import('../server/cases/db.ts')
  delete process.env.APIFY_TOKEN
  assert.match((await socialSearch('x', 'Libya')).status, /add APIFY_TOKEN/)
  process.env.APIFY_TOKEN = 'apify_api_test_token_not_real_000000'
  const real = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => {
    called = true
    throw new Error('should not be called')
  }) as typeof fetch
  try {
    logApifySpend('test', 'seed', 0, BUDGET_USD)
    const r = await socialSearch('tiktok', 'Libya')
    assert.match(r.status, /budget reached/)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = real
    delete process.env.APIFY_TOKEN
  }
})
