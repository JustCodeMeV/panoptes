import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { loadLayer } from './core/aggregate.ts'
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
