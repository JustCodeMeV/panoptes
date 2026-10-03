import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Feature } from '../shared/feature.ts'
import { buildNetwork, isFlagged, storySubgraph } from '../shared/network.ts'
import type { Assessment, SourceClass } from '../shared/truth.ts'

const M = 60_000
const story = (id: string, seq: [string, number, SourceClass?][], flagged = true): Feature => ({
  id,
  layerId: 'news',
  title: id,
  geoPrecision: 'none',
  observedAt: '',
  source: { provider: 'p', platform: 'p', retrievedAt: '' },
  tags: [],
  props: {
    assessment: {
      verdict: 'unverified', risk: 0, reasons: [], factChecks: [], coverage: null, signals: [], spread: 0,
      campaign: {
        score: flagged ? 60 : 0,
        flags: flagged ? [{ id: 'x', label: 'x', severity: 'warn', detail: '' }] : [],
        timeline: seq.map(([source, min, cls]) => ({ at: min * M, source, cls: cls ?? 'state', title: '', url: '' })),
        blocs: [], socialAccounts: 0, firstHourSources: 0,
      },
    } satisfies Assessment,
  },
})

test('edge points from the usual leader, with median lead', () => {
  const g = buildNetwork([story('s1', [['tass.ru', 0], ['presstv.ir', 30]]), story('s2', [['tass.ru', 0], ['presstv.ir', 10]])])
  assert.equal(g.edges.length, 1)
  const e = g.edges[0]
  assert.deepEqual([e.from, e.to, e.weight, e.led], ['tass.ru', 'presstv.ir', 2, 2])
  assert.ok([10, 30].includes(e.medianLeadMin))
})

test('pairs further apart than 6 h are not linked; repeated sources count once', () => {
  const g = buildNetwork([story('s', [['a', 0], ['a', 5], ['b', 7 * 60]])])
  assert.equal(g.edges.length, 0)
  assert.equal(g.nodes.find((n) => n.id === 'a')?.stories, 1)
})

test('recurring = same pair on 3+ flagged stories', () => {
  const s = (i: number, f = true) => story(`s${i}`, [['a', 0], ['b', 5]], f)
  assert.equal(buildNetwork([s(1), s(2), s(3, false)]).edges[0].recurring, false)
  assert.equal(buildNetwork([s(1), s(2), s(3)]).edges[0].recurring, true)
  assert.equal(buildNetwork([s(1), s(2), s(3, false)], { onlyFlagged: true }).edges[0].weight, 2)
})

test('story subgraph keeps global pair history', () => {
  const all = [story('s1', [['a', 0], ['b', 5]]), story('s2', [['a', 0], ['b', 5], ['c', 6]])]
  const sub = storySubgraph(buildNetwork(all), all[0])
  assert.deepEqual(sub.nodes.map((n) => n.id).sort(), ['a', 'b'])
  assert.equal(sub.edges[0].weight, 2)
  assert.equal(isFlagged(all[0].props.assessment as Assessment), true)
})
