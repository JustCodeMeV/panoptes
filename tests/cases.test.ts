import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as cases from '../server/cases/db.ts'
import type { Feature } from '../shared/feature.ts'

const f = (id: string): Feature => ({
  id, layerId: 'news', title: `T ${id}`, position: { lat: 1, lon: 2 }, geoPrecision: 'inferred', observedAt: new Date().toISOString(),
  source: { provider: 'p', platform: 'x', retrievedAt: new Date().toISOString() }, tags: [], props: { v: 1 },
})

test('case lifecycle: create, add (idempotent), note, export, remove, audit', () => {
  const c = cases.createCase('Op Test')
  cases.addItem(c.id, f('a'), 'first')
  cases.addItem(c.id, f('a')) // same feature again: updates snapshot, no duplicate
  cases.addItem(c.id, f('b'))
  const full = cases.getCase(c.id)!
  assert.equal(full.items.length, 2)
  cases.setNote(full.items[0].id, 'noted')
  const ex = cases.exportCase(c.id)!
  assert.equal(ex.evidence.length, 2)
  assert.ok(ex.evidence.some((e) => e.analystNote === 'noted'))
  cases.removeItem(full.items[1].id)
  assert.equal(cases.getCase(c.id)!.items.length, 1)
  const actions = cases.auditLog().map((a) => a.action)
  for (const a of ['case.create', 'item.add', 'item.note', 'case.export', 'item.remove']) assert.ok(actions.includes(a), a)
})
