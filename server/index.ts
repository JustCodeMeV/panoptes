// Many sources are polled concurrently; the default 4-thread DNS pool makes start-up bursts fail.
process.env.UV_THREADPOOL_SIZE ??= '32'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { FeatureSchema } from '../shared/feature.ts'
import { loadLayer } from './core/aggregate.ts'
import * as cases from './cases/db.ts'
import { LAYERS } from './layers.ts'
import { streamSource, subscribe } from './core/hub.ts'
import { marketHistory, startMarketsEngine } from './markets/engine.ts'
import { startNewsEngine } from './news/engine.ts'
import { startUnrestEngine } from './unrest/engine.ts'
import { checkClaim, engineStatus } from './truth/engine.ts'

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/layers', (c) =>
  c.json(
    Object.entries(LAYERS).map(([id, providers]) => ({
      id,
      providers: providers.map((p) => ({ id: p.id, enabled: p.enabled?.() ?? true })),
    })),
  ),
)

app.get('/api/layers/:id', async (c) => {
  const providers = LAYERS[c.req.param('id')]
  if (!providers) return c.json({ error: 'unknown layer' }, 404)
  return c.json(await loadLayer(c.req.param('id'), providers))
})

app.get('/api/markets/history', async (c) => {
  const id = c.req.query('id') ?? ''
  const h = await marketHistory(id)
  return h ? c.json(h) : c.json({ error: 'unknown market' }, 404)
})

app.get('/api/truth/status', (c) => c.json(engineStatus()))

app.post('/api/truth/check', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { claim?: unknown }
  const claim = typeof body.claim === 'string' ? body.claim.trim() : ''
  if (claim.length < 8) return c.json({ error: 'claim must be at least 8 characters' }, 400)
  return c.json(await checkClaim(claim))
})

// ---- cases (local SQLite) ----
const jsonBody = async (c: { req: { json(): Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
app.get('/api/cases', (c) => c.json(cases.listCases()))
app.post('/api/cases', async (c) => {
  const b = await jsonBody(c)
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  return title ? c.json(cases.createCase(title)) : c.json({ error: 'title required' }, 400)
})
app.get('/api/cases/:id', (c) => {
  const r = cases.getCase(Number(c.req.param('id')))
  return r ? c.json(r) : c.json({ error: 'not found' }, 404)
})
app.delete('/api/cases/:id', (c) => (cases.deleteCase(Number(c.req.param('id'))), c.json({ ok: true })))
app.post('/api/cases/:id/items', async (c) => {
  const b = await jsonBody(c)
  const f = FeatureSchema.safeParse(b.feature)
  if (!f.success) return c.json({ error: 'invalid feature' }, 400)
  cases.addItem(Number(c.req.param('id')), f.data, typeof b.note === 'string' ? b.note : '')
  return c.json({ ok: true })
})
app.patch('/api/items/:id', async (c) => {
  const b = await jsonBody(c)
  cases.setNote(Number(c.req.param('id')), typeof b.note === 'string' ? b.note : '')
  return c.json({ ok: true })
})
app.delete('/api/items/:id', (c) => (cases.removeItem(Number(c.req.param('id'))), c.json({ ok: true })))
app.get('/api/cases/:id/export', (c) => {
  const r = cases.exportCase(Number(c.req.param('id')))
  if (!r) return c.json({ error: 'not found' }, 404)
  c.header('content-disposition', `attachment; filename="panoptes-case-${c.req.param('id')}.json"`)
  return c.json(r)
})
app.get('/api/audit', (c) => c.json(cases.auditLog()))

// Live push: one snapshot on connect, then every story change as it happens.
app.get('/api/stream/:id', (c) => {
  const layerId = c.req.param('id')
  const source = streamSource(layerId)
  if (!source) return c.json({ error: 'not a stream layer' }, 404)
  return streamSSE(c, async (stream) => {
    const queue: { event: string; data: string }[] = []
    let wake: (() => void) | undefined
    const push = (event: string, data: unknown) => {
      queue.push({ event, data: JSON.stringify(data) })
      wake?.()
    }
    const off = subscribe(layerId, (e) => push(e.type, e))
    stream.onAbort(() => {
      off()
      wake?.()
    })
    push('snapshot', source.snapshot())
    let lastBeat = Date.now()
    while (!stream.aborted) {
      while (queue.length) {
        const m = queue.shift()!
        await stream.writeSSE(m)
      }
      if (Date.now() - lastBeat > 15_000) {
        lastBeat = Date.now()
        push('status', source.heartbeat())
        continue
      }
      await new Promise<void>((r) => {
        wake = r
        setTimeout(r, 5_000)
      })
    }
    off()
  })
})

startNewsEngine()
startMarketsEngine()
startUnrestEngine()

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () =>
  console.log(`[panoptes] api on http://localhost:${port}`),
)
