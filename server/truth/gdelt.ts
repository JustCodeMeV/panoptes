import type { Coverage, CoverageArticle } from '../../shared/truth.ts'
import { establishedOutlet, stateOutlet } from './domains.ts'
import { searchTerms } from './text.ts'

/**
 * GDELT DOC 2.0 (keyless). Hard limit: ONE request per 5 s, so every call goes
 * through a single priority queue (user checks jump ahead of background work)
 * with a 10-minute result cache.
 */
const SPACING_MS = 8000
const TTL_MS = 10 * 60_000
const WINDOW = '3d'

type Job = { priority: number; run: () => Promise<void> }
const queue: Job[] = []
let running = false
let lastCall = 0
const cache = new Map<string, { at: number; value: Coverage }>()

async function drain() {
  if (running) return
  running = true
  while (queue.length) {
    queue.sort((a, b) => b.priority - a.priority)
    const job = queue.shift()!
    const wait = lastCall + SPACING_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
    await job.run()
  }
  running = false
}

type GdeltArticle = {
  url: string
  title: string
  domain: string
  language?: string
  sourcecountry?: string
  seendate?: string
}

async function fetchArticles(query: string, attempt = 0): Promise<GdeltArticle[]> {
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?' +
    new URLSearchParams({ query: `${query} sourcelang:english`, mode: 'artlist', maxrecords: '75', format: 'json', timespan: WINDOW, sort: 'hybridrel' })
  const res = await fetch(url, { headers: { 'user-agent': 'panoptes-research/0.1' }, signal: AbortSignal.timeout(30_000) })
  const body = (await res.text()).trim()
  if (body.startsWith('{')) return (JSON.parse(body).articles ?? []) as GdeltArticle[]
  if (/limit requests/i.test(body) && attempt < 2) {
    await new Promise((r) => setTimeout(r, SPACING_MS + 1000))
    return fetchArticles(query, attempt + 1)
  }
  throw new Error(`GDELT: ${body.slice(0, 120) || `HTTP ${res.status}`}`)
}

function summarize(query: string, list: GdeltArticle[]): Coverage {
  const established = new Set<string>()
  const state = new Set<string>()
  const domains = new Set<string>()
  const countries = new Set<string>()
  for (const a of list) {
    domains.add(a.domain)
    if (a.sourcecountry) countries.add(a.sourcecountry)
    const e = establishedOutlet(a.domain)
    if (e) established.add(e)
    const s = stateOutlet(a.domain)
    if (s) state.add(s)
  }
  const rank = (a: GdeltArticle) => (establishedOutlet(a.domain) ? 0 : stateOutlet(a.domain) ? 1 : 2)
  const articles: CoverageArticle[] = [...list]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 8)
    .map((a) => ({
      url: a.url,
      title: a.title,
      domain: a.domain,
      country: a.sourcecountry,
      language: a.language,
      seen: a.seendate,
    }))
  return {
    query,
    window: WINDOW,
    total: list.length,
    domains: domains.size,
    countries: [...countries].slice(0, 12),
    establishedOutlets: [...established],
    stateOutlets: [...state],
    articles,
  }
}

/** Coverage of a claim in the last 3 days. Throws if GDELT is unreachable. */
export function coverageFor(text: string, priority = 0): Promise<Coverage | null> {
  const terms = searchTerms(text, 4)
  if (terms.length < 2) return Promise.resolve(null)
  const query = terms.join(' ')
  const hit = cache.get(query)
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value)

  return new Promise((resolve, reject) => {
    queue.push({
      priority,
      run: async () => {
        try {
          const value = summarize(query, await fetchArticles(query))
          cache.set(query, { at: Date.now(), value })
          resolve(value)
        } catch (e) {
          reject(e)
        }
      },
    })
    void drain()
  })
}
