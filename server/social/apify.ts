import { apifyRunsSince, apifySpent, logApifySpend } from '../cases/db.ts'
import { redact } from '../core/secrets.ts'

/**
 * APIFY: X, TikTok and Instagram, the socials with no free access. Runs only
 * when an analyst clicks a transform, never on a timer. The key has a small
 * prepaid credit, so every run is bounded three ways: at most MAX_ITEMS
 * results, Apify's own per-run charge cap (maxTotalChargeUsd), and a spend
 * ledger in SQLite that refuses new runs past BUDGET_USD in total.
 */

export const BUDGET_USD = Number(process.env.APIFY_BUDGET_USD) || 2.5
const MAX_ITEMS = 15
const RUN_CAP_USD = 0.1
const RUNS_PER_HOUR = 6
const CACHE_MS = 6 * 3600_000

export type Network = 'x' | 'tiktok' | 'instagram'
export type SocialPost = { network: Network; url: string; author: string; text: string; at: number; engagement?: number; media?: string }

// Pay-per-result actors; `estimate` is a conservative per-item price used when the run reports no cost.
const ACTORS: Record<Network, { id: string; estimate: number; input: (q: string) => Record<string, unknown>; map: (x: Record<string, any>) => SocialPost | null }> = {
  x: {
    id: 'apidojo~tweet-scraper',
    estimate: 0.0005,
    input: (q) => ({ searchTerms: [q], maxItems: MAX_ITEMS, sort: 'Latest' }),
    map: (t) => (t.url && t.text ? { network: 'x', url: t.url, author: t.author?.userName ?? '?', text: t.text, at: Date.parse(t.createdAt) || Date.now(), engagement: (t.likeCount ?? 0) + (t.retweetCount ?? 0) } : null),
  },
  tiktok: {
    id: 'clockworks~tiktok-scraper',
    estimate: 0.006,
    input: (q) => ({ searchQueries: [q], resultsPerPage: MAX_ITEMS, searchSection: '/video', shouldDownloadVideos: false, shouldDownloadCovers: false }),
    map: (v) => (v.webVideoUrl ? { network: 'tiktok', url: v.webVideoUrl, author: v.authorMeta?.name ?? '?', text: v.text ?? '', at: Date.parse(v.createTimeISO) || Date.now(), engagement: v.playCount, media: v.videoMeta?.coverUrl } : null),
  },
  instagram: {
    id: 'apify~instagram-hashtag-scraper',
    estimate: 0.003,
    input: (q) => ({ hashtags: [q.replace(/[^\p{L}\p{N}]/gu, '')], resultsLimit: MAX_ITEMS }),
    map: (p) => (p.url ? { network: 'instagram', url: p.url, author: p.ownerUsername ?? '?', text: p.caption ?? '', at: Date.parse(p.timestamp) || Date.now(), engagement: p.likesCount, media: p.displayUrl } : null),
  },
}

const cache = new Map<string, { at: number; posts: SocialPost[] }>()

export const apifyStatus = () => ({ enabled: !!process.env.APIFY_TOKEN, spentUsd: Math.round(apifySpent() * 100) / 100, budgetUsd: BUDGET_USD })

/** Runs one actor for a query, within budget. Returns posts plus a human status line. */
export async function socialSearch(network: Network, query: string): Promise<{ posts: SocialPost[]; status: string }> {
  const token = process.env.APIFY_TOKEN
  if (!token) return { posts: [], status: 'Apify is off: add APIFY_TOKEN to enable X, TikTok and Instagram searches' }
  const key = `${network}:${query.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return { posts: hit.posts, status: `${hit.posts.length} ${network} posts (cached, no new spend)` }
  const spent = apifySpent()
  if (spent + RUN_CAP_USD > BUDGET_USD) return { posts: [], status: `Apify budget reached: $${spent.toFixed(2)} of $${BUDGET_USD.toFixed(2)} spent` }
  if (apifyRunsSince(new Date(Date.now() - 3600_000).toISOString()) >= RUNS_PER_HOUR) return { posts: [], status: `Apify paused: ${RUNS_PER_HOUR} runs this hour already` }
  const a = ACTORS[network]
  try {
    const run = await fetch(`https://api.apify.com/v2/acts/${a.id}/runs?waitForFinish=120&maxItems=${MAX_ITEMS}&maxTotalChargeUsd=${RUN_CAP_USD}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(a.input(query)),
      signal: AbortSignal.timeout(150_000),
    })
    if (!run.ok) throw new Error(`HTTP ${run.status} api.apify.com`)
    const r = ((await run.json()) as { data: { defaultDatasetId: string; usageTotalUsd?: number; status: string } }).data
    const items = await fetch(`https://api.apify.com/v2/datasets/${r.defaultDatasetId}/items?clean=1&limit=${MAX_ITEMS}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
    const raw = items.ok ? ((await items.json()) as Record<string, unknown>[]) : []
    const posts = raw.map((x) => a.map(x)).filter((p): p is SocialPost => !!p)
    const usd = Math.max(r.usageTotalUsd ?? 0, raw.length * a.estimate + 0.005)
    logApifySpend(a.id, query, raw.length, usd)
    cache.set(key, { at: Date.now(), posts })
    return { posts, status: `${posts.length} ${network} posts · Apify $${(spent + usd).toFixed(2)} of $${BUDGET_USD.toFixed(2)} used${r.status !== 'SUCCEEDED' ? ` (run ${r.status.toLowerCase()})` : ''}` }
  } catch (e) {
    return { posts: [], status: `Apify ${network} search failed: ${redact(e instanceof Error ? e.message : String(e))}` }
  }
}
