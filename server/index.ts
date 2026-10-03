import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { loadLayer } from './core/aggregate.ts'
import { LAYERS } from './layers.ts'
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

app.get('/api/truth/status', (c) => c.json(engineStatus()))

app.post('/api/truth/check', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { claim?: unknown }
  const claim = typeof body.claim === 'string' ? body.claim.trim() : ''
  if (claim.length < 8) return c.json({ error: 'claim must be at least 8 characters' }, 400)
  return c.json(await checkClaim(claim))
})

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () =>
  console.log(`[panoptes] api on http://localhost:${port}`),
)
