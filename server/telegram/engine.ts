import type { Feature, LayerResponse, ProviderStatus } from '../../shared/feature.ts'
import type { LiveEvent } from '../../shared/live.ts'
import { backoffMs } from '../core/aggregate.ts'
import { eventsPerMin, publish, registerStream } from '../core/hub.ts'
import { redact } from '../core/secrets.ts'
import { scoreLocations } from '../geo/gazetteer.ts'
import { ingestSocial } from '../news/engine.ts'
import type { NewsItem } from '../news/ingest.ts'
import { hash } from '../truth/text.ts'
import { CHANNELS, type Channel } from './channels.ts'
import { parsePage, type TgPost } from './parse.ts'

/**
 * TELEGRAM SCOUTS. A pool of workers reads public channels through the
 * keyless web preview (t.me/s/<handle>), the same page anyone can open in a
 * browser. No account, no bot: Telegram bots cannot read channels they do not
 * administer, and the preview needs neither.
 *
 * Politeness: at most CONCURRENCY requests in flight and one request start
 * per MIN_GAP_MS across the whole swarm; each channel is polled at a cadence
 * that follows how often it posts (30 s for a busy war channel, 10 min for a
 * quiet one) and backs off on errors.
 *
 * Signals: posts are geolocated, fed to the live wire as social reports, and
 * compared across channels: the same text appearing on several channels
 * within an hour is flagged as a coordination cluster. Channels that others
 * keep forwarding or linking are probed and added as "discovered" scouts.
 */

export const LAYER_ID = 'telegram'
const CONCURRENCY = 6
const MIN_GAP_MS = 350
const MIN_EVERY = 30_000
const MAX_EVERY = 10 * 60_000
const WINDOW_MS = 12 * 3600_000
const MAX_POSTS = 900
const MAX_DISCOVERED = 40
const COORD_WINDOW_MS = 60 * 60_000
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

type Scout = {
  ch: Channel
  nextAt: number
  busy: boolean
  failures: number
  lastId: number
  okAt: number
  error?: string
  ms: number
  /** New posts per hour (smoothed). */
  rate: number
  polls: number
  title?: string
  subscribers?: number
}

type Stored = TgPost & { key: string; seenAt: number; shingles: Set<string>; cluster?: string }
type Cluster = { id: string; posts: string[]; channels: string[]; firstAt: number; first: string; sample: string }

const scouts = new Map<string, Scout>()
const posts = new Map<string, Stored>()
const clusters = new Map<string, Cluster>()
const features = new Map<string, Feature>()
const candidates = new Map<string, { handle: string; refs: Set<string>; hits: number; probed: boolean }>()
let requests: number[] = []

const chOf = (handle: string) => scouts.get(handle.toLowerCase())?.ch

// ---------- text similarity (copy-paste coordination) ----------

/** Lowercased words without links, mentions, emoji or punctuation. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@\w+/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .match(/[\p{L}\p{N}]+/gu) ?? []
}

export function shingles(text: string, k = 4): Set<string> {
  const w = normalize(text)
  const out = new Set<string>()
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(' '))
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  const [s, l] = a.size < b.size ? [a, b] : [b, a]
  for (const x of s) if (l.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/** Joins a new post to the cluster of a near-identical recent post on another channel. */
function cluster(p: Stored): Cluster | undefined {
  if (p.shingles.size < 6) return undefined
  for (const q of posts.values()) {
    if (q.handle === p.handle || q.key === p.key || Math.abs(q.at - p.at) > COORD_WINDOW_MS) continue
    // A plain forward is amplification, not copy-paste; it is tracked through forwardedFrom.
    if (p.forwardedFrom && p.forwardedFrom.toLowerCase() === q.handle.toLowerCase()) continue
    if (jaccard(p.shingles, q.shingles) < 0.6) continue
    let c = q.cluster ? clusters.get(q.cluster) : undefined
    if (!c) {
      c = { id: `tgc:${hash(q.key)}`, posts: [q.key], channels: [q.handle], firstAt: q.at, first: q.handle, sample: q.text.slice(0, 200) }
      clusters.set(c.id, c)
      q.cluster = c.id
    }
    c.posts.push(p.key)
    if (!c.channels.includes(p.handle)) c.channels.push(p.handle)
    if (p.at < c.firstAt) [c.firstAt, c.first] = [p.at, p.handle]
    p.cluster = c.id
    return c
  }
}

// ---------- recurring copy pairs ----------

const RECURRING = 3

/** Leader -> follower counts over all live clusters: who copies whom, and how often. */
export function copyPairs(): { from: string; to: string; count: number }[] {
  const n = new Map<string, number>()
  for (const c of clusters.values()) {
    const order = c.posts
      .map((k) => posts.get(k))
      .filter((p): p is Stored => !!p)
      .sort((a, b) => a.at - b.at)
    const firstOf = new Map<string, number>()
    for (const p of order) if (!firstOf.has(p.handle)) firstOf.set(p.handle, p.at)
    const hs = [...firstOf.keys()]
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) n.set(`${hs[i]}|${hs[j]}`, (n.get(`${hs[i]}|${hs[j]}`) ?? 0) + 1)
  }
  return [...n.entries()].map(([k, count]) => ({ from: k.split('|')[0], to: k.split('|')[1], count })).sort((a, b) => b.count - a.count)
}

/** A cluster is coordinated when 3+ channels carry it, or when two channels that keep copying each other do. */
function isCoordinated(c: Cluster, pairs: { from: string; to: string; count: number }[]): { yes: boolean; pair?: { from: string; to: string; count: number } } {
  if (c.channels.length >= 3) return { yes: true }
  const pair = pairs.find((p) => p.count >= RECURRING && c.channels.includes(p.from) && c.channels.includes(p.to))
  return { yes: !!pair, pair }
}

// ---------- features ----------

const lang = (t: string) =>
  /[؀-ۿ]/.test(t) ? (/[پچژگ]/.test(t) ? 'fa' : 'ar') : /[֐-׿]/.test(t) ? 'he' : /[Ѐ-ӿ]/.test(t) ? (/[іїєґ]/i.test(t) ? 'uk' : 'ru') : 'en'

function toFeature(p: Stored): Feature {
  const ch = chOf(p.handle)
  const geo = scoreLocations([{ text: p.text.slice(0, 600) }])
  const placed = geo && geo.confidence >= 0.5 ? geo : null
  const c = p.cluster ? clusters.get(p.cluster) : undefined
  const coord = c ? isCoordinated(c, copyPairs()) : { yes: false }
  const ageH = (Date.now() - p.at) / 3600_000
  // Title: the first real line, joined with the next when it is only a lead-in ("Trump:", "BREAKING").
  const lines = p.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 3)
  const firstLine = (lines[0]?.length ?? 0) < 30 && lines[1] ? `${lines[0]} ${lines[1]}` : (lines[0] ?? p.text)
  return {
    id: `${LAYER_ID}:${p.key}`,
    layerId: LAYER_ID,
    title: (firstLine.length > 160 ? firstLine.slice(0, 157) + '…' : firstLine) || '(media post)',
    // A post that names no place is listed but not pinned: the channel's home is not where the event is.
    position: placed ? { lat: placed.lat, lon: placed.lon } : undefined,
    geoPrecision: placed ? 'inferred' : 'none',
    geoBasis: placed
      ? `post names "${placed.name}"${placed.kind === 'place' && placed.country ? ` (${placed.country})` : ''}`
      : `no place named in the post${ch?.region ? `; channel covers ${ch.region}` : ''}`,
    observedAt: new Date(p.at).toISOString(),
    source: { provider: 'telegram-scouts', platform: `t.me/${p.handle}`, url: `https://t.me/${p.post}`, retrievedAt: new Date(p.seenAt).toISOString() },
    tags: ['telegram', ch?.type ?? 'unvetted', ...(coord.yes ? ['coordinated'] : [])],
    props: {
      handle: p.handle,
      channel: ch?.name ?? p.handle,
      tier: ch?.tier ?? 4,
      type: ch?.type ?? 'osint',
      topic: ch?.topic,
      bloc: ch?.bloc,
      discovered: !!ch?.discovered,
      subscribers: scouts.get(p.handle.toLowerCase())?.subscribers,
      text: p.text.slice(0, 1500),
      lang: lang(p.text),
      views: p.views,
      // Too early to call a rate in the first half hour.
      viewsPerHour: p.views && ageH >= 0.5 ? Math.round(p.views / ageH) : undefined,
      media: p.media,
      forwardedFrom: p.forwardedFrom,
      forwardedName: p.forwardedName,
      mentions: p.mentions.slice(0, 8),
      link: p.link,
      cluster: c && {
        id: c.id,
        size: c.posts.length,
        channels: c.channels,
        first: c.first,
        firstAt: c.firstAt,
        leadMin: Math.round((p.at - c.firstAt) / 60_000),
        coordinated: coord.yes,
        ...(coord.pair ? { recurringPair: coord.pair } : {}),
      },
    },
  }
}

const statusOf = (s: Scout): ProviderStatus => {
  const stale = !!s.error && s.okAt > 0
  let count = 0
  for (const p of posts.values()) if (p.handle === s.ch.handle) count++
  return { id: `tg:${s.ch.handle}`, ok: !s.error || stale, count, ms: s.ms, ...(s.error ? { error: s.error } : {}), ...(stale ? { stale: true } : {}) }
}
export const statusList = (): ProviderStatus[] => [...scouts.values()].filter((s) => s.polls || s.error).map(statusOf)

export function snapshot(): LayerResponse {
  return { layerId: LAYER_ID, generatedAt: new Date().toISOString(), features: [...features.values()], providers: statusList() }
}
registerStream(LAYER_ID, {
  snapshot,
  heartbeat: (): LiveEvent => ({ type: 'status', at: Date.now(), providers: statusList(), eventsPerMin: eventsPerMin(LAYER_ID) }),
})

/** Swarm overview for the panel: how many scouts, how hard they are working, what they found. */
export function swarmStats() {
  const now = Date.now()
  requests = requests.filter((t) => now - t < 60_000)
  const list = [...scouts.values()]
  const pairs = copyPairs()
  const coordinated = [...clusters.values()].filter((c) => isCoordinated(c, pairs).yes)
  return {
    scouts: list.length,
    curated: list.filter((s) => !s.ch.discovered).length,
    discovered: list.filter((s) => s.ch.discovered).map((s) => ({ handle: s.ch.handle, name: s.title ?? s.ch.handle, refs: candidates.get(s.ch.handle.toLowerCase())?.refs.size ?? 0 })),
    failing: list.filter((s) => s.error && !s.okAt).length,
    requestsPerMin: requests.length,
    posts: posts.size,
    clusters: coordinated.length,
    copyPairs: pairs.filter((p) => p.count >= 2).slice(0, 5),
    busiest: list
      .filter((s) => s.polls)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 6)
      .map((s) => ({ handle: s.ch.handle, perHour: Math.round(s.rate), everySec: Math.round(cadence(s) / 1000) })),
  }
}

// ---------- ingest ----------

function toNewsItem(p: Stored): NewsItem {
  const text = p.text.replace(/\s+/g, ' ').trim()
  return { id: hash(p.post), feedId: `tg:${p.handle}`, title: text.slice(0, 180), summary: text.slice(180, 580), url: `https://t.me/${p.post}`, domain: `t.me/${p.handle}`, published: p.at }
}

async function ingest(s: Scout, got: TgPost[], silent: boolean) {
  const fresh: Stored[] = []
  const cutoff = Date.now() - WINDOW_MS
  for (const p of got) {
    const key = p.post.toLowerCase()
    const prev = posts.get(key)
    if (prev) {
      if (p.views && p.views !== prev.views) prev.views = p.views // views keep growing while a post is on the page
      continue
    }
    if (p.at < cutoff || (p.text.length < 25 && !p.media)) continue
    const st: Stored = { ...p, key, seenAt: Date.now(), shingles: shingles(p.text) }
    posts.set(key, st)
    fresh.push(st)
    for (const h of [p.forwardedFrom, ...p.mentions]) if (h) noteCandidate(h, s.ch.handle)
  }
  for (const p of fresh) {
    const before = p.cluster
    const c = cluster(p)
    const f = toFeature(p)
    features.set(f.id, f)
    if (!silent) {
      const ch = s.ch
      const change = c && c.channels.length >= 2 ? `same text on ${c.channels.length} channels, first @${c.first}` : p.forwardedFrom ? `fwd from @${p.forwardedFrom}` : undefined
      publish(LAYER_ID, { type: 'upsert', kind: 'new', feature: f, change, item: { title: f.title, source: `@${ch.handle}`, at: p.at } })
    }
    // Cluster grew: refresh the other members so their detail shows the spread.
    if (c && c.id !== before)
      for (const k of c.posts) {
        const q = posts.get(k)
        if (!q || q.key === p.key) continue
        const g = toFeature(q)
        features.set(g.id, g)
        if (!silent) publish(LAYER_ID, { type: 'upsert', kind: 'update', feature: g, change: `copied by ${c.channels.length} channels` })
      }
  }
  // A pair that just reached RECURRING copies turns its earlier clusters coordinated too.
  if (fresh.some((p) => p.cluster))
    for (const q of posts.values()) {
      if (!q.cluster) continue
      const id = `${LAYER_ID}:${q.key}`
      const g = toFeature(q)
      if (features.get(id)?.tags.includes('coordinated') === g.tags.includes('coordinated')) continue
      features.set(id, g)
      if (!silent) publish(LAYER_ID, { type: 'upsert', kind: 'update', feature: g, change: 'part of a recurring copy pair' })
    }
  if (fresh.length) await ingestSocial(fresh.map(toNewsItem), silent)
}

// ---------- discovery ----------

function noteCandidate(handle: string, from: string) {
  const k = handle.toLowerCase()
  if (scouts.has(k)) return
  const c = candidates.get(k) ?? { handle, refs: new Set<string>(), hits: 0, probed: false }
  c.refs.add(from.toLowerCase())
  c.hits++
  candidates.set(k, c)
  const discovered = [...scouts.values()].filter((s) => s.ch.discovered).length
  // Referenced by at least two different channels, three times: worth a look.
  if (!c.probed && c.refs.size >= 2 && c.hits >= 3 && discovered < MAX_DISCOVERED) {
    c.probed = true
    addScout({ handle: c.handle, name: c.handle, tier: 4, type: 'osint', topic: 'conflict', discovered: true }, Date.now() + 2000)
    console.log(`[telegram] discovered @${c.handle} (referenced by ${[...c.refs].slice(0, 4).join(', ')})`)
  }
}

// ---------- scheduling ----------

/** Poll interval from posting rate: a channel posting 30/h is read every ~40 s, a quiet one every 10 min. */
function cadence(s: Scout): number {
  const base = 3600_000 / Math.max(0.1, s.rate) / 3
  return Math.min(MAX_EVERY, Math.max(MIN_EVERY, base))
}

function addScout(ch: Channel, at: number) {
  scouts.set(ch.handle.toLowerCase(), { ch, nextAt: at, busy: false, failures: 0, lastId: 0, okAt: 0, ms: 0, rate: 2, polls: 0 })
}

let lastStart = 0
async function slot() {
  const now = Date.now()
  const wait = Math.max(0, lastStart + MIN_GAP_MS - now)
  lastStart = now + wait
  if (wait) await new Promise((r) => setTimeout(r, wait))
  requests.push(Date.now())
}

async function fetchPage(handle: string, before?: number) {
  await slot()
  const res = await fetch(`https://t.me/s/${handle}${before ? `?before=${before}` : ''}`, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.8' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} t.me`)
  return parsePage(await res.text(), handle)
}

async function poll(s: Scout) {
  const t0 = Date.now()
  const first = s.polls === 0
  try {
    const page = await fetchPage(s.ch.handle)
    s.title ??= page.title
    if (page.subscribers) s.subscribers = page.subscribers
    if (s.ch.discovered && s.ch.name === s.ch.handle && page.title) s.ch.name = page.title
    // A discovered channel that is empty or dormant is dropped again.
    if (first && s.ch.discovered && (!page.posts.length || Date.now() - Math.max(...page.posts.map((p) => p.at)) > 14 * 86400_000)) {
      scouts.delete(s.ch.handle.toLowerCase())
      return
    }
    const fresh = page.posts.filter((p) => p.msgId > s.lastId)
    await ingest(s, page.posts, first || !primed)
    // Busy channel: more new posts than one page holds. Read one page back to close the gap.
    if (page.posts.length && (first || (s.lastId && fresh.length === page.posts.length))) {
      const older = await fetchPage(s.ch.handle, Math.min(...page.posts.map((p) => p.msgId)))
      await ingest(s, older.posts, true)
    }
    const hours = s.okAt ? (Date.now() - s.okAt) / 3600_000 : 0
    if (hours > 0) s.rate = 0.6 * s.rate + 0.4 * (fresh.length / hours)
    else if (page.posts.length >= 2) {
      const span = (Math.max(...page.posts.map((p) => p.at)) - Math.min(...page.posts.map((p) => p.at))) / 3600_000
      s.rate = page.posts.length / Math.max(0.5, span)
    }
    s.lastId = Math.max(s.lastId, ...page.posts.map((p) => p.msgId))
    if (s.failures) console.log(`[tg:${s.ch.handle}] recovered after ${s.failures} failure(s)`)
    s.failures = 0
    s.error = undefined
    s.okAt = Date.now()
    s.nextAt = Date.now() + cadence(s) * (0.85 + Math.random() * 0.3)
  } catch (e) {
    s.error = redact(e instanceof Error ? e.message : String(e))
    s.failures++
    const wait = backoffMs(s.failures, cadence(s), Number(s.error.match(/HTTP (\d{3})/)?.[1]) || 0)
    s.nextAt = Date.now() + wait
    if (s.failures === 1 || s.failures % 10 === 0) console.warn(`[tg:${s.ch.handle}] failed (${s.failures}x): ${s.error}`)
  } finally {
    s.polls++
    s.ms = Date.now() - t0
  }
}

function prune() {
  const cutoff = Date.now() - WINDOW_MS
  const sorted = [...posts.values()].sort((a, b) => b.at - a.at)
  const gone = sorted.filter((p, i) => p.at < cutoff || i >= MAX_POSTS)
  for (const p of gone) {
    posts.delete(p.key)
    features.delete(`${LAYER_ID}:${p.key}`)
  }
  for (const c of clusters.values()) if (!c.posts.some((k) => posts.has(k))) clusters.delete(c.id)
  if (gone.length) publish(LAYER_ID, { type: 'remove', ids: gone.map((p) => `${LAYER_ID}:${p.key}`) })
}

let started = false
let primed = false
export const isPrimed = () => primed

export function startTelegramScouts() {
  if (started) return
  started = true
  CHANNELS.forEach((ch, i) => addScout(ch, Date.now() + i * 150))
  const worker = async () => {
    for (;;) {
      const now = Date.now()
      const due = [...scouts.values()].filter((s) => !s.busy && s.nextAt <= now).sort((a, b) => a.nextAt - b.nextAt)[0]
      if (!due) {
        await new Promise((r) => setTimeout(r, 500))
        continue
      }
      due.busy = true
      await poll(due)
      due.busy = false
      if (!primed && [...scouts.values()].every((s) => s.polls > 0 || s.ch.discovered)) {
        primed = true
        console.log(`[telegram] primed: ${posts.size} posts from ${scouts.size} channels`)
      }
    }
  }
  for (let i = 0; i < CONCURRENCY; i++) void worker()
  setInterval(prune, 5 * 60_000)
}

// ---------- network graph ----------

/**
 * Telegram spread as stories for the co-amplification graph (shared/network.ts):
 * each copy-paste cluster and each forward links the channels involved, first
 * poster leading. Clusters on 3+ channels count as flagged.
 */
export function networkStories(): Feature[] {
  const out: Feature[] = []
  const entry = (p: Stored, at = p.at) => {
    const ch = chOf(p.handle)
    return { at, source: `t.me/${p.handle}`, cls: 'social' as const, bloc: ch?.bloc, title: p.text.slice(0, 120), url: `https://t.me/${p.post}` }
  }
  const story = (id: string, title: string, timeline: ReturnType<typeof entry>[], flagged: boolean): Feature => ({
    id,
    layerId: LAYER_ID,
    title,
    geoPrecision: 'none',
    observedAt: new Date(timeline[0].at).toISOString(),
    source: { provider: 'telegram-scouts', platform: 'telegram', retrievedAt: new Date().toISOString() },
    tags: [],
    props: {
      assessment: {
        campaign: {
          score: flagged ? 40 : 10,
          flags: flagged ? [{ id: 'tg-copy', label: 'Coordinated copy', severity: 'warn', detail: `same text on ${new Set(timeline.map((t) => t.source)).size} Telegram channels within an hour` }] : [],
          timeline,
          blocs: [],
          socialAccounts: timeline.length,
          firstHourSources: timeline.length,
        },
      },
    },
  })
  const pairs = copyPairs()
  for (const c of clusters.values()) {
    const members = c.posts.map((k) => posts.get(k)).filter((p): p is Stored => !!p)
    if (new Set(members.map((m) => m.handle)).size < 2) continue
    out.push(story(c.id, `Telegram: ${c.sample.slice(0, 100)}`, members.sort((a, b) => a.at - b.at).map((m) => entry(m)), isCoordinated(c, pairs).yes))
  }
  for (const p of posts.values()) {
    if (!p.forwardedFrom || p.forwardedFrom.toLowerCase() === p.handle.toLowerCase()) continue
    const origin = { ...entry(p, p.at - 60_000), source: `t.me/${p.forwardedFrom}`, bloc: chOf(p.forwardedFrom)?.bloc, url: `https://t.me/${p.forwardedFrom}` }
    out.push(story(`tgf:${p.key}`, `Forward: @${p.forwardedFrom} → @${p.handle}`, [origin, entry(p)], false))
  }
  return out
}
