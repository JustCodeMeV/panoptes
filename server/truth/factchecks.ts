import { XMLParser } from 'fast-xml-parser'
import type { FactCheckMatch, ReviewVerdict } from '../../shared/truth.ts'
import { TtlCache } from '../core/cache.ts'
import { stripHtml, tokenSet } from './text.ts'

export type FactCheckItem = {
  publisher: string
  title: string
  url: string
  date?: string
  summary: string
  verdict: ReviewVerdict
  tokens: Set<string>
}

type Feed = { publisher: string; url: string; kind: 'checks' | 'fakes' | 'analysis' }

/** Keyless RSS/Atom feeds verified reachable. Add feeds here. */
const FEEDS: Feed[] = [
  { publisher: 'StopFake', url: 'https://www.stopfake.org/en/feed/', kind: 'fakes' },
  { publisher: 'EUvsDisinfo', url: 'https://euvsdisinfo.eu/feed/', kind: 'analysis' },
  { publisher: 'Snopes', url: 'https://www.snopes.com/feed/', kind: 'checks' },
  { publisher: 'FactCheck.org', url: 'https://www.factcheck.org/feed/', kind: 'checks' },
  { publisher: 'Full Fact', url: 'https://fullfact.org/feed/all/', kind: 'checks' },
  { publisher: 'Lead Stories', url: 'https://leadstories.com/atom.xml', kind: 'checks' },
  { publisher: 'BBC Verify', url: 'https://www.bbc.co.uk/news/reality_check/rss.xml', kind: 'checks' },
]

const FALSE_RE =
  /\b(false|fake|fakes|fabricat\w*|hoax|debunk\w*|not true|no evidence|baseless|bogus|doctored|manipulated|staged|fictional|falsely|untrue|disinformation|misinformation|never said|did not|didn't)\b/i
const MISLEAD_RE =
  /\b(misleading|out of context|missing context|exaggerat\w*|partly|partially|mostly false|unproven|unsubstantiated|unverified|satire|mixture|half[- ]true)\b/i
const TRUE_RE = /^(fact check:? )?(true|correct|accurate|confirmed|authentic|genuine)\b/i

/** Verdict is inferred from the publisher's own headline/summary wording. */
function classify(feed: Feed, title: string, summary: string): ReviewVerdict {
  const head = `${title} ${summary.slice(0, 200)}`
  if (TRUE_RE.test(title)) return 'true'
  if (feed.kind === 'fakes') return 'false'
  if (MISLEAD_RE.test(head)) return 'misleading'
  if (FALSE_RE.test(head)) return 'false'
  return feed.kind === 'analysis' ? 'analysis' : 'reviewed'
}

const text = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (typeof v === 'object' && '#text' in v) return String((v as Record<string, unknown>)['#text'])
  return ''
}
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true })

async function loadFeed(feed: Feed): Promise<FactCheckItem[]> {
  const res = await fetch(feed.url, {
    headers: { 'user-agent': 'Mozilla/5.0 panoptes-research/0.1', accept: 'application/rss+xml, application/atom+xml, text/xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`${feed.publisher} HTTP ${res.status}`)
  const doc = parser.parse(await res.text())
  const rows: Record<string, unknown>[] = doc.rss ? arr(doc.rss.channel?.item) : arr(doc.feed?.entry)
  return rows.map((r) => {
    const title = stripHtml(text(r.title)).replace(/^fact check:?\s*/i, '')
    const summary = stripHtml(text(r.description) || text(r.summary) || text(r['content:encoded']) || text(r.content)).slice(0, 600)
    const link = doc.rss
      ? text(r.link)
      : String((arr(r.link as { '@_href'?: string }[]).find((l) => l['@_href']) ?? {})['@_href'] ?? '')
    const date = text(r.pubDate) || text(r.published) || text(r.updated)
    const parsed = date ? new Date(date) : undefined
    return {
      publisher: feed.publisher,
      title,
      url: link,
      date: parsed && !Number.isNaN(+parsed) ? parsed.toISOString() : undefined,
      summary,
      verdict: classify(feed, title, summary),
      tokens: tokenSet(`${title} ${summary.slice(0, 300)}`),
    }
  })
}

export type Corpus = {
  items: FactCheckItem[]
  idf: Map<string, number>
  feeds: { publisher: string; ok: boolean; count: number; error?: string }[]
}

const cache = new TtlCache<Corpus>(20 * 60_000)

export function loadCorpus(): Promise<Corpus> {
  return cache.get('corpus', async () => {
    const results = await Promise.allSettled(FEEDS.map(loadFeed))
    const items: FactCheckItem[] = []
    const feeds: Corpus['feeds'] = []
    results.forEach((r, i) => {
      const publisher = FEEDS[i].publisher
      if (r.status === 'fulfilled') {
        items.push(...r.value.filter((x) => x.url && x.title))
        feeds.push({ publisher, ok: true, count: r.value.length })
      } else {
        const error = r.reason instanceof Error ? r.reason.message : String(r.reason)
        console.warn(`[factcheck:${publisher}] ${error}`)
        feeds.push({ publisher, ok: false, count: 0, error })
      }
    })
    const df = new Map<string, number>()
    for (const it of items) for (const t of it.tokens) df.set(t, (df.get(t) ?? 0) + 1)
    const idf = new Map([...df].map(([t, n]) => [t, Math.log((items.length + 1) / (n + 1)) + 1]))
    return { items, idf, feeds }
  })
}

export const MATCH_MIN = 0.45
export const MATCH_STRONG = 0.6

/**
 * How much of the claim's (idf-weighted) vocabulary a published fact-check
 * covers. Needs >=2 shared terms so one generic word can never match.
 */
export function matchFactChecks(corpus: Corpus, claim: string, limit = 4): FactCheckMatch[] {
  const q = tokenSet(claim)
  if (q.size < 2) return []
  const w = (t: string) => corpus.idf.get(t) ?? Math.log(corpus.items.length + 1) + 1
  let total = 0
  for (const t of q) total += w(t)
  const out: FactCheckMatch[] = []
  for (const it of corpus.items) {
    let shared = 0
    let sum = 0
    for (const t of q) {
      if (!it.tokens.has(t)) continue
      shared++
      sum += w(t)
    }
    if (shared < 2) continue
    const score = sum / total
    if (score >= MATCH_MIN)
      out.push({ publisher: it.publisher, title: it.title, url: it.url, date: it.date, verdict: it.verdict, score: Math.round(score * 100) / 100 })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Optional: official Google Fact Check Tools search (needs GOOGLE_FACTCHECK_API_KEY). */
export async function googleFactChecks(claim: string): Promise<FactCheckMatch[]> {
  const key = process.env.GOOGLE_FACTCHECK_API_KEY
  if (!key) return []
  const url = 'https://factchecktools.googleapis.com/v1alpha1/claims:search?' + new URLSearchParams({ query: claim.slice(0, 200), key, pageSize: '5' })
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Google Fact Check HTTP ${res.status}`)
  const data = (await res.json()) as {
    claims?: { text: string; claimReview?: { publisher?: { name?: string }; url: string; title?: string; textualRating?: string; reviewDate?: string }[] }[]
  }
  const out: FactCheckMatch[] = []
  for (const c of data.claims ?? []) {
    for (const r of c.claimReview ?? []) {
      const rating = r.textualRating ?? ''
      out.push({
        publisher: r.publisher?.name ?? 'Fact-checker',
        title: `${c.text}${rating ? ` — rated: ${rating}` : ''}`,
        url: r.url,
        date: r.reviewDate,
        verdict: /true|correct|accurate/i.test(rating) && !/false|mostly|partly/i.test(rating) ? 'true' : MISLEAD_RE.test(rating) ? 'misleading' : FALSE_RE.test(rating) ? 'false' : 'reviewed',
        score: 0.7,
      })
    }
  }
  return out
}
