import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Feature } from '../shared/feature.ts'

const story: Feature = {
  id: 'news:t1', layerId: 'news', title: 't1', geoPrecision: 'none', observedAt: '', source: { provider: 'p', platform: 'p', retrievedAt: '' }, tags: [], props: {},
}

// The case store reads the active case from the browser's storage when it loads
const storage = new Map<string, string>([['panoptes.case', '1']])
globalThis.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) } as Storage
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Answers the case API like the server, except that saving an item gets `onSave`. */
function server(onSave: () => Promise<Response>): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    if (url === '/api/cases/1/items' && init?.method === 'POST') return onSave()
    if (url === '/api/cases') return json([{ id: 1, title: 'c', created: '', items: 0 }])
    if (url === '/api/cases/1') return json({ id: 1, title: 'c', created: '', items: [] })
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch
}

test('"Add to case" says "Saved" only when the server stored it, and explains a failure instead of throwing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { useCases } = await import('../src/core/cases.ts')
  const real = globalThis.fetch
  try {
    globalThis.fetch = server(async () => json({ ok: true }))
    await useCases.getState().add(story)
    assert.equal(useCases.getState().toast, 'Saved to case')

    globalThis.fetch = server(async () => json({ error: 'request body too large' }, 413))
    await useCases.getState().add(story)
    assert.equal(useCases.getState().toast, 'Not saved: request body too large')

    globalThis.fetch = server(async () => {
      throw new TypeError('Failed to fetch')
    })
    await useCases.getState().add(story)
    assert.equal(useCases.getState().toast, 'Not saved: server unreachable')
  } finally {
    globalThis.fetch = real
  }
})
