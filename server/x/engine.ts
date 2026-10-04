import type { Feature, LayerResponse, ProviderStatus } from '../../shared/feature.ts'
import type { LiveEvent } from '../../shared/live.ts'
import type { Assessment } from '../../shared/truth.ts'
import { eventsPerMin, listenerCount, publish, registerStream, streamSource, subscribe } from '../core/hub.ts'
import { askGrok, grokEnabled, type XCheck } from './grok.ts'

/**
 * Twitter/X layer: decides when a story is worth a second opinion from X and asks Grok.
 *
 * A story qualifies when it is gaining traction but nobody has settled it yet: unverified or
 * disputed, with real attention (several sources, or a coordinated-looking spread). Checks run
 * only while someone has the Twitter/X switch on, one at a time, within an hourly budget, and
 * each story is re-checked at most every RECHECK_MS. Results are published as features placed
 * on the story (or where X points, when Grok names a more specific place).
 */

export const LAYER_ID = 'x'
// Campaign Watch is derived from these same stories, so the News Wire covers both
const WATCHED = 'news'
const RESCAN_MS = 5 * 60_000
const MAX_PER_HOUR = Number(process.env.XAI_MAX_PER_HOUR) || 20
const RECHECK_MS = 45 * 60_000
const GAP_MS = 20_000
const MAX_KEPT = 120

const checks = new Map<string, Feature>() // by story id
const lastAsked = new Map<string, number>()
const queue = new Map<string, Feature>() // story id -> latest version
const calls: number[] = []
let busy = false
let lastScan = 0
let lastError: string | undefined
let ok = 0

/** Is this story worth asking X about? */
export function worthChecking(f: Feature): boolean {
  const a = f.props.assessment as Assessment | undefined
  if (!a || (a.verdict !== 'unverified' && a.verdict !== 'disputed')) return false
  const sources = Number(f.props.outlets ?? 0) + Number(f.props.social ?? 0)
  const items = Number(f.props.items ?? 0)
  // High attention, a coordinated-looking spread, or a story many outlets are carrying at once
  const coordinated = (a.campaign?.score ?? 0) >= 50
  return a.risk >= 62 || coordinated || (items >= 6 && sources >= 5)
}

function status(): ProviderStatus[] {
  return [{ id: 'grok-x-search', ok: grokEnabled() && !lastError, count: ok, ms: 0, ...(grokEnabled() ? (lastError ? { error: lastError } : {}) : { error: 'no XAI_API_KEY' }) }]
}

export function snapshot(): LayerResponse {
  return { layerId: LAYER_ID, generatedAt: new Date().toISOString(), features: [...checks.values()], providers: status() }
}
const heartbeat = (): LiveEvent => ({ type: 'status', at: Date.now(), providers: status(), eventsPerMin: eventsPerMin(LAYER_ID) })
registerStream(LAYER_ID, { snapshot, heartbeat })

function toFeature(story: Feature, c: XCheck): Feature {
  const placed = c.location?.lat !== undefined && c.location.lon !== undefined
  const lead = c.posts.find((p) => p.stance !== 'context') ?? c.posts[0]
  return {
    id: `${LAYER_ID}:${story.id}`,
    layerId: LAYER_ID,
    title: c.summary.split(/(?<=[.!?])\s/)[0].slice(0, 160),
    position: placed ? { lat: c.location!.lat!, lon: c.location!.lon! } : story.position,
    geoPrecision: placed ? 'inferred' : story.geoPrecision,
    geoBasis: placed ? `Grok places it at ${c.location!.name}` : `position of the checked story${story.geoBasis ? ` (${story.geoBasis})` : ''}`,
    observedAt: c.checkedAt,
    source: { provider: 'grok-x-search', platform: 'x.com via Grok', url: lead?.url, retrievedAt: c.checkedAt },
    tags: ['x', c.verdict],
    props: { ...c, storyId: story.id, storyLayer: story.layerId, storyTitle: story.title },
  }
}

const budgetLeft = () => {
  const now = Date.now()
  while (calls.length && now - calls[0] > 3600_000) calls.shift()
  return calls.length < MAX_PER_HOUR
}

/** Highest-attention story first. */
function next(): Feature | undefined {
  let best: Feature | undefined
  for (const f of queue.values()) if (!best || Number(f.props.risk ?? 0) > Number(best.props.risk ?? 0)) best = f
  return best
}

async function pump() {
  if (busy || !grokEnabled() || listenerCount(LAYER_ID) === 0 || !budgetLeft()) return
  // Someone just switched it on, or it's been a while: look over the stories already out there
  if (Date.now() - lastScan > RESCAN_MS) {
    lastScan = Date.now()
    for (const f of streamSource(WATCHED)?.snapshot().features ?? []) consider(f)
  }
  const story = next()
  if (!story) return
  queue.delete(story.id)
  busy = true
  calls.push(Date.now())
  lastAsked.set(story.id, Date.now())
  try {
    const c = await askGrok(story)
    const f = toFeature(story, c)
    const known = checks.has(story.id)
    checks.delete(story.id)
    checks.set(story.id, f)
    while (checks.size > MAX_KEPT) checks.delete(checks.keys().next().value!)
    lastError = undefined
    ok++
    publish(LAYER_ID, { type: 'upsert', kind: known ? 'update' : 'new', feature: f, change: `X says: ${c.verdict} (${c.confidence}%)` })
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
  } finally {
    busy = false
  }
}

function consider(f: Feature) {
  if (!worthChecking(f)) return
  const asked = lastAsked.get(f.id)
  if (asked && Date.now() - asked < RECHECK_MS) return
  queue.set(f.id, f)
}

export function startXEngine() {
  subscribe(WATCHED, (e) => {
    if (e.type === 'upsert') consider(e.feature)
  })
  setInterval(() => void pump(), GAP_MS).unref()
}
