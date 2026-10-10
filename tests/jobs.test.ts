import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cancel, every, jobIds, nextDue, once, runDue, setDriver } from '../server/runtime/jobs.ts'

test('jobs run when due, once per period, and a failure does not stop the others', async () => {
  const woke: number[] = []
  setDriver({ wake: (at) => woke.push(at) }) // manual time: nothing fires on its own
  const t0 = Date.now()
  let a = 0
  let b = 0
  every('t:a', 1000, () => a++, 0)
  every('t:fail', 1000, () => {
    throw new Error('boom')
  }, 0)
  once('t:b', 500, () => b++)
  assert.ok(woke.length > 0)
  await runDue(t0 + 10)
  assert.equal(a, 1)
  assert.equal(b, 0)
  await runDue(t0 + 600)
  assert.equal(b, 1)
  assert.ok(!jobIds().includes('t:b'))
  await runDue(t0 + 700) // not due again yet
  assert.equal(a, 1)
  await runDue(t0 + 1100)
  assert.equal(a, 2)
  assert.ok((nextDue() ?? 0) > t0 + 1100)
  cancel('t:a')
  cancel('t:fail')
})
