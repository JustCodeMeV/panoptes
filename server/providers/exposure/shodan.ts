import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { countryOfCode, jitter } from '../cyber/common.ts'

/**
 * EXPOSED INFRASTRUCTURE (Shodan, defensive attack-surface view). For each category we ask Shodan
 * ONLY for aggregate country counts via /shodan/host/count, which returns a total plus facet buckets
 * and consumes NO query credits. One Feature per country = "N devices of this category are exposed
 * here", pinned at the country centroid. This is an exposure-scale map to warn operators and the
 * public; it never requests, stores or shows individual hosts, IPs, ports-per-host, screenshots or
 * streams. /shodan/host/search and /shodan/host/{ip} are never called.
 */

type Category = { id: string; label: string; query: string }

// Aggregate exposure queries. No vuln: facet (needs paid membership and would spend credits).
const CATEGORIES: Category[] = [
  { id: 'ics', label: 'Industrial control systems', query: 'tag:ics' },
  { id: 'cameras', label: 'Unsecured cameras', query: 'device:webcam' },
  ...(process.env.SHODAN_EXTRA === '1'
    ? [
        { id: 'databases', label: 'Open databases', query: 'product:MongoDB' },
        { id: 'rdp', label: 'Exposed remote desktop', query: 'port:3389 has_screenshot:true' },
      ]
    : []),
]

type CountResponse = { total: number; facets?: { country?: { value: string; count: number }[] } }

async function countByCountry(cat: Category, key: string, signal: AbortSignal): Promise<CountResponse> {
  const url = `https://api.shodan.io/shodan/host/count?key=${encodeURIComponent(key)}&query=${encodeURIComponent(cat.query)}&facet=country`
  const r = await fetch(url, { headers: { 'user-agent': 'argus-research/0.1' }, signal })
  if (!r.ok) throw new Error(`HTTP ${r.status} shodan ${cat.id}`)
  return (await r.json()) as CountResponse
}

export const shodanProvider: Provider = {
  id: 'shodan-exposure',
  layerId: 'exposure',
  requires: ['SHODAN_API_KEY'],
  ttlMs: 6 * 60 * 60_000, // counts move slowly; stay gentle on the account
  async fetch({ signal }) {
    const key = process.env.SHODAN_API_KEY
    if (!key) return []
    const now = new Date().toISOString()
    const out: Feature[] = []
    for (const cat of CATEGORIES) {
      const res = await countByCountry(cat, key, signal).catch((e) => {
        console.warn(`[shodan] ${cat.id}: ${e instanceof Error ? e.message : e}`)
        return null
      })
      if (!res) continue
      // Only countries carrying a meaningful share; drop the long tail of single exposures
      const buckets = (res.facets?.country ?? []).filter((b) => b.count >= 3).slice(0, 60)
      for (const b of buckets) {
        const c = countryOfCode(b.value)
        if (!c) continue
        const j = jitter(`${cat.id}:${b.value}`, 1.4)
        out.push({
          id: `exposure:${cat.id}:${b.value}`,
          layerId: 'exposure',
          title: `${b.count.toLocaleString()} exposed ${cat.label.toLowerCase()} in ${c.name}`,
          position: { lat: c.lat + j.dLat, lon: c.lon + j.dLon },
          geoPrecision: 'approximate',
          geoBasis: `aggregate count for ${c.name} (spread around its centre)`,
          observedAt: now,
          source: { provider: 'shodan-exposure', platform: 'Shodan', url: 'https://www.shodan.io/', retrievedAt: now },
          tags: ['exposure', cat.id],
          props: { kind: 'exposure', category: cat.id, categoryLabel: cat.label, country: c.name, count: b.count, total: res.total },
        })
      }
    }
    return out
  },
}
