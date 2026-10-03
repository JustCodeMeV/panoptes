import { XMLParser } from 'fast-xml-parser'
import { hash, stripHtml } from '../truth/text.ts'
import type { NewsFeed } from './sources.ts'

export type NewsItem = {
  id: string
  feedId: string
  title: string
  summary: string
  url: string
  domain: string
  published: number
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true })
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const txt = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as Record<string, unknown>)['#text'])
  return ''
}

const etags = new Map<string, string>()

function hostOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return fallback
  }
}


async function pollBluesky(feed: NewsFeed): Promise<NewsItem[]> {
  const res = await fetch(feed.url, { headers: { 'user-agent': 'Mozilla/5.0 panoptes-research/0.1' }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = (await res.json()) as { posts?: { uri: string; indexedAt: string; author: { handle: string }; record: { text?: string; createdAt?: string }; repostCount?: number; likeCount?: number }[] }
  const out: NewsItem[] = []
  for (const p of d.posts ?? []) {
    const text = (p.record.text ?? '').replace(/\s+/g, ' ').trim()
    if (text.length < 25) continue
    const t = Date.parse(p.record.createdAt ?? p.indexedAt)
    out.push({
      id: hash(p.uri),
      feedId: feed.id,
      title: text.slice(0, 180),
      summary: text.slice(180, 500),
      url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`,
      domain: `bsky:${p.author.handle}`,
      published: Number.isNaN(t) ? Date.now() : Math.min(t, Date.now()),
    })
  }
  return out
}

/** Returns null when the feed says "not modified" (cheap poll). */
export async function pollFeed(feed: NewsFeed): Promise<NewsItem[] | null> {
  if (feed.kind === 'bluesky') return pollBluesky(feed)
  const headers: Record<string, string> = {
    'user-agent': 'Mozilla/5.0 panoptes-research/0.1',
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
  }
  const tag = etags.get(feed.id)
  if (tag) headers['if-none-match'] = tag
  const res = await fetch(feed.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  if (res.status === 304) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const et = res.headers.get('etag')
  if (et) etags.set(feed.id, et)

  const doc = parser.parse(await res.text())
  const rows: Record<string, unknown>[] = doc.rss
    ? arr(doc.rss.channel?.item)
    : doc['rdf:RDF']
      ? arr(doc['rdf:RDF'].item)
      : arr(doc.feed?.entry)

  const out: NewsItem[] = []
  for (const r of rows) {
    let title = stripHtml(txt(r.title))
    if (!title) continue
    const link = doc.rss || doc['rdf:RDF'] ? txt(r.link) : String((arr(r.link as { '@_href'?: string }[]).find((l) => l['@_href']) ?? {})['@_href'] ?? '')
    // Google News: real outlet is in <source url=...>, and the title ends " - Outlet".
    const src = r.source as { '@_url'?: string; '#text'?: string } | undefined
    let domain = feed.domain
    if (src?.['@_url']) {
      domain = hostOf(src['@_url'], feed.domain)
      const name = txt(src)
      if (name && title.endsWith(` - ${name}`)) title = title.slice(0, -(name.length + 3))
    } else domain = hostOf(link, feed.domain)

    const d = txt(r.pubDate) || txt(r['dc:date']) || txt(r.published) || txt(r.updated)
    const t = d ? Date.parse(d) : NaN
    out.push({
      id: hash(link || title),
      feedId: feed.id,
      title,
      summary: stripHtml(txt(r.description) || txt(r.summary) || txt(r['content:encoded'])).slice(0, 400),
      url: link,
      domain,
      published: Number.isNaN(t) ? Date.now() : Math.min(t, Date.now()),
    })
  }
  // Undated feeds come in arbitrary order: truncating would let items drift in and out of view.
  return out.sort((a, b) => b.published - a.published).slice(0, 150)
}
