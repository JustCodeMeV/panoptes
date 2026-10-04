import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localize, looksForeign } from '../server/core/translate.ts'

test('foreign scripts and Latin-script languages are sent for translation', () => {
  assert.equal(looksForeign('Два человека пострадали в Киеве'), true)
  assert.equal(looksForeign('انفجار في بيروت'), true)
  assert.equal(looksForeign('Los estudiantes protestan en la plaza por la reforma'), true)
  assert.equal(looksForeign('Die Regierung hat nicht mit der Opposition gesprochen'), true)
})

test('English is left alone', () => {
  assert.equal(looksForeign('Two injured in Russian strike on Northern Bridge in Kyiv'), false)
  assert.equal(looksForeign('Markets fall as oil spikes after the attack'), false)
  assert.equal(looksForeign('Zelensky meets Macron'), false)
})

test('localize never blocks: an unknown foreign title is returned unchanged for now', () => {
  const f = {
    id: 't:1',
    layerId: 'telegram',
    title: 'Президент Белоруссии прибыл в Москву',
    geoPrecision: 'none' as const,
    observedAt: new Date().toISOString(),
    source: { provider: 'x', platform: 'x', retrievedAt: new Date().toISOString() },
    tags: [],
    props: {},
  }
  assert.deepEqual(localize(f), f)
})
