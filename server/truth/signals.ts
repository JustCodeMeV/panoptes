import { XMLParser } from 'fast-xml-parser'
import type { Signal } from '../../shared/truth.ts'
import { trendingRss } from '../core/googletrends.ts'
import { stripHtml } from './text.ts'

/** A raw social/search trend. `context` = related headlines, used for topic gating & matching. */
export type RawSignal = Signal & { context: string[] }

const parser = new XMLParser({ ignoreAttributes: false })
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const str = (v: unknown) => (v == null ? '' : typeof v === 'object' ? String((v as Record<string, unknown>)['#text'] ?? '') : String(v))

const iso = (v: unknown): string => {
  const d = v ? new Date(String(v)) : new Date()
  return Number.isNaN(+d) ? new Date().toISOString() : d.toISOString()
}

function parseTraffic(t: string): number {
  const m = t.replace(/,/g, '').match(/([\d.]+)\s*([KMB]?)/i)
  if (!m) return 0
  return Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as 'k'] ?? 1))
}

// English-language regions give the topic gate and fact-check matcher usable text.
const GEOS = ['US', 'GB', 'IN', 'AU', 'CA', 'IE', 'ZA', 'NG', 'KE', 'PH', 'SG', 'PK']

async function googleTrends(geo: string): Promise<RawSignal[]> {
  const doc = parser.parse(await trendingRss(geo)) // shared, rate-limited client
  return arr<Record<string, unknown>>(doc.rss?.channel?.item).map((it) => {
    const news = arr<Record<string, unknown>>(it['ht:news_item'] as never)
    return {
      platform: 'google-trends',
      region: geo,
      text: str(it.title),
      volume: parseTraffic(str(it['ht:approx_traffic'])),
      url: str(news[0]?.['ht:news_item_url']) || undefined,
      at: iso(str(it.pubDate)),
      context: news.map((n) => str(n['ht:news_item_title'])).filter(Boolean),
    }
  })
}

const MASTODON = ['mastodon.social', 'mastodon.online', 'mstdn.social']

async function mastodon(host: string): Promise<RawSignal[]> {
  const get = async (path: string) => {
    const res = await fetch(`https://${host}/api/v1/trends/${path}?limit=20`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`${host} ${path} HTTP ${res.status}`)
    return res.json() as Promise<Record<string, unknown>[]>
  }
  const [links, statuses] = await Promise.allSettled([get('links'), get('statuses')])
  const out: RawSignal[] = []
  if (links.status === 'fulfilled') {
    for (const l of links.value) {
      const hist = arr(l.history as { uses?: string; accounts?: string }[])
      out.push({
        platform: 'mastodon',
        region: host,
        text: String(l.title ?? ''),
        volume: hist.slice(0, 2).reduce((n, h) => n + Number(h.uses ?? 0), 0),
        url: String(l.url ?? ''),
        at: iso(l.published_at),
        context: [stripHtml(String(l.description ?? '')).slice(0, 200)].filter(Boolean),
      })
    }
  }
  if (statuses.status === 'fulfilled') {
    for (const s of statuses.value) {
      out.push({
        platform: 'mastodon',
        region: host,
        text: stripHtml(String(s.content ?? '')).slice(0, 240),
        volume: Number(s.reblogs_count ?? 0) + Number(s.favourites_count ?? 0),
        url: String(s.url ?? ''),
        at: iso(s.created_at),
        context: [],
      })
    }
  }
  if (!out.length) throw new Error(`${host}: no trends`)
  return out
}

export type SignalLoad = { signals: RawSignal[]; sources: { id: string; ok: boolean; count: number; error?: string }[] }

export async function loadSignals(): Promise<SignalLoad> {
  const jobs: [string, Promise<RawSignal[]>][] = [
    ...GEOS.map((g): [string, Promise<RawSignal[]>] => [`trends:${g}`, googleTrends(g)]),
    ...MASTODON.map((h): [string, Promise<RawSignal[]>] => [`mastodon:${h}`, mastodon(h)]),
  ]
  const results = await Promise.allSettled(jobs.map(([, p]) => p))
  const signals: RawSignal[] = []
  const sources: SignalLoad['sources'] = []
  results.forEach((r, i) => {
    const id = jobs[i][0]
    if (r.status === 'fulfilled') {
      signals.push(...r.value.filter((s) => s.text))
      sources.push({ id, ok: true, count: r.value.length })
    } else {
      sources.push({ id, ok: false, count: 0, error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
    }
  })
  return { signals, sources }
}
