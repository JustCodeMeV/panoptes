// Many sources are polled concurrently; the default 4-thread DNS pool makes start-up bursts fail.
process.env.UV_THREADPOOL_SIZE ??= '32'

import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { streamSSE } from 'hono/streaming'
import { FeatureSchema } from '../shared/feature.ts'
import { loadLayer } from './core/aggregate.ts'
import * as cases from './cases/db.ts'
import { LAYERS } from './layers.ts'
import { streamSource, subscribe } from './core/hub.ts'
import { marketHistory, startMarketsEngine } from './markets/engine.ts'
import { snapshot as newsSnapshot, startNewsEngine } from './news/engine.ts'
import { buildNetwork, storySubgraph } from '../shared/network.ts'
import { startUnrestEngine } from './unrest/engine.ts'
import { checkClaim, engineStatus } from './truth/engine.ts'
import { reloadWatches, startWatchEngine } from './watch/engine.ts'
import { geolocate } from './geo/gazetteer.ts'
import { briefFor } from './llm/analysis.ts'
import { llmEnabled, llmStatus } from './llm/client.ts'

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

// AI analyst brief for any story-like feature (news, campaign, narrative, checked claim).
app.post('/api/llm/brief', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { feature?: unknown }
  const f = FeatureSchema.safeParse(b.feature)
  if (!f.success || !f.data.props.assessment) return c.json({ error: 'invalid feature' }, 400)
  if (!llmEnabled()) return c.json({ error: llmStatus().error }, 503)
  const brief = await briefFor(f.data)
  return brief ? c.json(brief) : c.json({ error: llmStatus().error ?? 'brief unavailable' }, 503)
})

// Co-amplification network over live stories (?story=<feature id> for one story's subgraph).
app.get('/api/network', (c) => {
  const story = c.req.query('story')?.replace(/^campaigns:/, 'news:')
  const all = newsSnapshot().features
  if (!story) return c.json(buildNetwork(all, c.req.query('all') === '1' ? { maxNodes: 60 } : { onlyFlagged: true }))
  // One story's sources, with pair history across ALL live stories (that is where recurrence shows).
  const f = all.find((x) => x.id === story)
  if (!f) return c.json({ error: 'unknown story' }, 404)
  return c.json(storySubgraph(buildNetwork(all, { maxNodes: Infinity, maxEdges: Infinity }), f))
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
const NOT_CONFIGURED = /^no (credentials|[A-Z_]*(KEY|TOKEN|EMAIL))/
app.get('/api/health/sources', async (c) => {
  const rows: { layer: string; id: string; ok: boolean; error?: string }[] = []
  for (const [layer, providers] of Object.entries(LAYERS)) {
    const live = streamSource(layer)
    const statuses = live ? live.snapshot().providers : (await loadLayer(layer, providers)).providers
    for (const p of statuses) rows.push({ layer, id: p.id, ok: p.ok, error: p.error })
  }
  for (const s of engineStatus()) rows.push({ layer: 'truth', id: s.id, ok: s.ok, error: s.error })
  const l = llmStatus()
  rows.push({ layer: 'ai', id: l.id, ok: l.ok, error: l.error })
  // A source waiting for an optional key is "off", not broken.
  return c.json(rows.map((r) => ({ ...r, off: !r.ok && NOT_CONFIGURED.test(r.error ?? '') })))
})

// ---- region watches ----
app.get('/api/watches', (c) => c.json(cases.listWatches()))
app.post('/api/watches', async (c) => {
  const b = await jsonBody(c)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  let lat = num(b.lat)
  let lon = num(b.lon)
  let name = typeof b.name === 'string' ? b.name.trim() : ''
  const place = typeof b.place === 'string' ? b.place.trim() : ''
  if ((lat === undefined || lon === undefined) && place) {
    const hit = geolocate(place)
    if (!hit) return c.json({ error: `no known place in "${place}"` }, 400)
    lat = hit.lat
    lon = hit.lon
    name ||= hit.name
  }
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return c.json({ error: 'place or lat/lon required' }, 400)
  const radiusKm = Math.min(3000, Math.max(5, num(b.radiusKm) ?? 150))
  const layers = Array.isArray(b.layers) ? b.layers.filter((x): x is string => typeof x === 'string') : []
  const w = cases.createWatch({ name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon, radiusKm, layers })
  await reloadWatches(LAYERS)
  return c.json(w)
})
app.delete('/api/watches/:id', async (c) => {
  cases.deleteWatch(Number(c.req.param('id')))
  await reloadWatches(LAYERS)
  return c.json({ ok: true })
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
startWatchEngine(LAYERS)

// Production (e.g. Render): one service serves the API and the built frontend.
// Skipped in dev, where Vite serves the frontend and proxies /api here.
if (existsSync('dist/index.html')) {
  app.use('*', async (c, next) => (c.req.path.startsWith('/api/') ? next() : compress()(c, next)))
  app.use('/assets/*', async (c, next) => (await next(), c.res.headers.set('cache-control', 'public, max-age=31536000, immutable')))
  app.use('*', serveStatic({ root: './dist' }))
  app.get('*', (c, next) => (c.req.path.startsWith('/api/') ? next() : serveStatic({ path: './dist/index.html' })(c, next)))
}

const port = Number(process.env.PORT ?? 8787)
// Loopback locally; all interfaces on Render (which sets RENDER=true) so its router can reach us.
const hostname = process.env.HOST ?? (process.env.RENDER ? '0.0.0.0' : '127.0.0.1')
serve({ fetch: app.fetch, port, hostname }, () => console.log(`[panoptes] listening on http://${hostname}:${port}`))
// Open SSE streams and poll timers would otherwise keep the old process (and the port) alive on restart.
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, () => process.exit(0))
