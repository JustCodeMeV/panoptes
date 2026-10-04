import type { Feature } from '../../../shared/feature.ts'
import { centroidOf, scoreLocations } from '../../geo/gazetteer.ts'
import { pollFeed, type NewsItem } from '../../news/ingest.ts'
import type { NewsFeed } from '../../news/sources.ts'
import { issuerOf } from '../../truth/issuers.ts'

/**
 * PUBLICATIONS (statements by governments, analyses by think tanks): feeds read
 * straight from the issuer where it publishes RSS, otherwise through grouped
 * Google News `site:` searches. Each item keeps who issued it and how that
 * issuer is funded and controlled (server/truth/issuers.ts).
 */

export const direct = (id: string, url: string, domain: string): NewsFeed => ({ id, url, domain })
/** One Google News search over several issuer sites. */
export const sites = (id: string, domains: string[], window = '3d'): NewsFeed => ({
  id: `gnews:${id}`,
  domain: 'news.google.com',
  url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${domains.map((d) => `site:${d}`).join(' OR ')} when:${window}`)}&hl=en-US&gl=US&ceid=US:en`,
})

const last = new Map<string, NewsItem[]>() // feed id -> last items (feeds answer 304 when unchanged)

/** Polls every feed (failures keep their last items), newest first, at most `perIssuer` items per issuer. */
export async function pollAll(feeds: NewsFeed[], perIssuer = 10): Promise<NewsItem[]> {
  await Promise.all(
    feeds.map(async (f) => {
      const items = await pollFeed(f).catch(() => null)
      if (items) last.set(f.id, items)
    }),
  )
  const seen = new Set<string>()
  const per = new Map<string, number>()
  const out: NewsItem[] = []
  for (const it of feeds.flatMap((f) => last.get(f.id) ?? []).sort((a, b) => b.published - a.published)) {
    const key = issuerOf(it.domain)?.name ?? it.domain
    if (seen.has(it.id) || (per.get(key) ?? 0) >= perIssuer) continue
    seen.add(it.id)
    per.set(key, (per.get(key) ?? 0) + 1)
    out.push(it)
  }
  return out
}

/** A publication as a feature: placed where the text says, else at the issuer's country (stated). */
export function publicationFeature(layerId: string, kind: 'statement' | 'analysis', it: NewsItem, maxAgeMs: number): Feature | null {
  if (Date.now() - it.published > maxAgeMs) return null
  const issuer = issuerOf(it.domain)
  if (!issuer) return null
  const geo = scoreLocations([{ text: it.title, weight: 2 }, { text: it.summary }])
  const home = centroidOf(issuer.country)
  const pos = geo ? { lat: geo.lat, lon: geo.lon } : home
  return {
    id: `${layerId}:${it.id}`,
    layerId,
    title: it.title,
    ...(pos ? { position: pos } : {}),
    geoPrecision: geo ? 'inferred' : pos ? 'approximate' : 'none',
    geoBasis: geo ? `${geo.name}, named in the text` : `no place named: shown at the issuer's country (${issuer.country})`,
    observedAt: new Date(it.published).toISOString(),
    source: { provider: issuer.domain, platform: issuer.name, url: it.url, retrievedAt: new Date().toISOString() },
    tags: [kind, issuer.kind, issuer.own],
    props: {
      kind,
      issuer: issuer.name,
      issuerCountry: issuer.country,
      issuerKind: issuer.kind,
      own: issuer.own,
      note: issuer.note,
      domain: issuer.domain,
      summary: it.summary,
      about: geo?.country ?? (geo?.kind === 'country' ? geo.name : undefined),
    },
  }
}
