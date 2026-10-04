import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allEntities, clearGraph, edgesOf, getEntity } from '../server/entities/graph.ts'
import { checkEvent, resolveEvents } from '../server/entities/resolve.ts'
import { actorsIn, ingestReport, kindOf } from '../server/entities/rules.ts'
import { precisionOf } from '../server/entities/llm.ts'
import { extractText } from '../server/entities/read.ts'

test('event kind from text, including Cyrillic/Arabic', () => {
  assert.equal(kindOf('Houthis claim missile and drone attack on Saudi Aramco'), 'drone-attack')
  assert.equal(kindOf('Israeli air strikes hit southern Lebanon'), 'strike')
  assert.equal(kindOf('Thousands protest in Belgrade'), 'protest')
  assert.equal(kindOf('North Korea test-fired an intermediate-range missile'), 'missile-test')
  assert.equal(kindOf('Обстріл Херсона'), 'shelling')
  assert.equal(kindOf('Weather is nice today'), 'other')
})

test('actors and roles from word order', () => {
  const a = actorsIn('Houthis strike Saudi-led coalition positions near Marib')
  assert.equal(a.find((x) => x.name === 'Houthis')?.role, 'attacker')
  assert.equal(a.find((x) => x.name === 'Saudi-led coalition')?.role, 'target')
  const c = actorsIn('Kremlin says Ukrainian forces attacked a power plant')
  assert.equal(c.find((x) => x.name === 'Kremlin')?.role, 'claimant')
})

const rep = (featureId: string, title: string, domain: string, at: number, position?: { lat: number; lon: number }) => ({
  featureId, title, text: title, at, url: `https://${domain}/x`, sources: [{ domain, url: `https://${domain}/x`, title, at }], position,
})

test('reports of the same event merge into one, and the check uses one rule for every country', () => {
  clearGraph()
  const t = Date.now()
  const a = ingestReport(rep('news:a', 'Russian drone attack hits Kharkiv apartment block', 'kyivindependent.com', t))!
  const b = ingestReport(rep('telegram:b', 'Drone attack on Kharkiv overnight, Russian forces used Shahed drones', 't.me/kpszsu', t + 600_000))!
  const c = ingestReport(rep('news:c', 'Drone attack hits Kharkiv, Russian forces blamed', 'dawn.com', t + 900_000))!
  const kept = resolveEvents([a, b, c])
  assert.equal(kept.size, 1)
  const id = [...kept][0]
  assert.equal(edgesOf(id, ['reported_by']).length, 3)
  const check = checkEvent(id)!
  assert.equal(check.status, 'confirmed') // independent outlets from UA and PK
  assert.equal(allEntities().filter((e) => e.type === 'event').length, 1)
  // A story carried only by government outlets is flagged the same way whichever government it is.
  for (const [fid, domain] of [['news:us', 'voanews.com'], ['news:ru', 'tass.com']] as const) {
    const ev = ingestReport(rep(fid, `Explosion reported at ${domain === 'tass.com' ? 'Belgorod' : 'Kherson'} depot`, domain, t))!
    assert.equal(checkEvent(ev)?.status, 'government-only', domain)
  }
  assert.ok(getEntity(id)?.position)
})

test('model precision words are normalised', () => {
  assert.equal(precisionOf('village'), 'exact')
  assert.equal(precisionOf('city'), 'town')
  assert.equal(precisionOf('oblast'), 'region')
  assert.equal(precisionOf('country'), 'country')
})

test('article text extraction keeps paragraphs, drops boilerplate', () => {
  const html = `<html><article><p>${'A drone struck the Pivdennyi bridge in Kyiv on Thursday, officials said, forcing closures. '.repeat(3)}</p><p>Subscribe to our newsletter for more updates and offers today now.</p></article></html>`
  const t = extractText(html)
  assert.match(t, /Pivdennyi bridge/)
  assert.doesNotMatch(t, /newsletter/)
})
