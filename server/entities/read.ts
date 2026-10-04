import { stripHtml } from '../truth/text.ts'

/**
 * Reads an article: fetches the page and keeps the main text (paragraphs of
 * the <article>, or of the page), without extra dependencies. Polite: one
 * request per domain every 5 s, at most READS_PER_HOUR per hour, cached.
 */

const READS_PER_HOUR = 120
const DOMAIN_GAP_MS = 5000
const MAX_CHARS = 4000
const SKIP = /(^|\.)(news\.google\.com|t\.me|bsky\.app|twitter\.com|x\.com|youtube\.com|wsj\.com|ft\.com|bloomberg\.com|nytimes\.com|economist\.com|washingtonpost\.com)$/

const cache = new Map<string, string | null>()
const lastByDomain = new Map<string, number>()
const reads: number[] = []

export function extractText(html: string): string {
  const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripHtml(m[1])).filter((t) => t.length > 60 && !/cookie|subscribe|newsletter|all rights reserved|javascript/i.test(t))
  const text = paras.join('\n')
  if (text.length > 200) return text.slice(0, MAX_CHARS)
  const og = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)/i)?.[1]
  return og ? stripHtml(og) : ''
}

/** Article text, or null when skipped, throttled or unreadable. */
export async function readArticle(url: string): Promise<string | null> {
  if (cache.has(url)) return cache.get(url)!
  let host: string
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
  if (SKIP.test(host)) return null
  const now = Date.now()
  while (reads.length && now - reads[0] > 3600_000) reads.shift()
  if (reads.length >= READS_PER_HOUR || now - (lastByDomain.get(host) ?? 0) < DOMAIN_GAP_MS) return null
  reads.push(now)
  lastByDomain.set(host, now)
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; panoptes-research/0.1)', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(12_000) })
    const text = res.ok && (res.headers.get('content-type') ?? '').includes('html') ? extractText(await res.text()) : ''
    cache.set(url, text || null)
    if (cache.size > 2000) cache.delete(cache.keys().next().value!)
    return text || null
  } catch {
    cache.set(url, null)
    return null
  }
}
