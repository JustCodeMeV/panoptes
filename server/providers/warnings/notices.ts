import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { scoreLocations } from '../../geo/gazetteer.ts'
import { pollFeed, type NewsItem } from '../../news/ingest.ts'
import { sites } from '../briefs/common.ts'

/**
 * MARITIME & AIR WARNINGS as reported: airspace closures and NOTAMs, live-fire
 * and navigational notices (every navy and maritime safety administration),
 * maritime security advisories (UKMTO, JMIC). The official broadcast-warning
 * API (NGA MSI) stopped updating in 2024, so these are read from the coverage
 * of the notices, located by the gazetteer. Items with no place are dropped.
 */
const q = (id: string, query: string) => ({ ...sites(id, []), url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en` })
const FEEDS = [
  q('wn-air', 'NOTAM OR "airspace closed" OR "airspace closure" OR "no-fly zone" OR "flight ban" when:2d'),
  q('wn-sea', '"navigational warning" OR "live-fire" OR "live fire drills" OR NAVTEX OR "maritime safety administration" OR "naval exercise" when:3d'),
  q('wn-sec', 'UKMTO OR "maritime security advisory" OR JMIC OR "vessel attacked" OR "ship attacked" OR "GPS interference" when:3d'),
  q('wn-launch', '"missile launch" OR "missile test" OR "rocket launch warning" OR "launch window" notice when:3d'),
]

const CATEGORIES: [string, string, RegExp][] = [
  ['missile / rocket launch', 'missile-test', /missile|rocket|launch/i],
  ['maritime security incident', 'navigation-warning', /ukmto|jmic|attack|hijack|pira|board|seiz|vessel|ship|tanker/i],
  ['GNSS interference', 'navigation-warning', /gps|gnss|jamming|spoof|interference/i],
  ['airspace closure', 'navigation-warning', /notam|airspace|no-fly|flight ban|flights? (suspend|cancel)/i],
  ['live firing / exercise', 'military-exercise', /live.fire|drill|exercise|manoeuvre|maneuver|firing/i],
  ['navigation warning', 'navigation-warning', /./],
]

const last = new Map<string, NewsItem[]>()

export function noticeFeature(it: NewsItem): Feature | null {
  // Airport/NOTAM directory pages ("IST - Istanbul Airport") are not notices
  if (it.title.length < 30 || /^[A-Z]{3,4} [-–] .*airport$/i.test(it.title)) return null
  const geo = scoreLocations([{ text: it.title, weight: 2 }, { text: it.summary }])
  if (!geo) return null
  const [category, kind] = CATEGORIES.find(([, , re]) => re.test(it.title))!
  return {
    id: `warnings:${it.id}`,
    layerId: 'warnings',
    title: it.title,
    position: { lat: geo.lat, lon: geo.lon },
    geoPrecision: geo.kind === 'country' ? 'approximate' : 'inferred',
    geoBasis: `${geo.name}, named in the report`,
    observedAt: new Date(it.published).toISOString(),
    source: { provider: it.domain, platform: it.domain, url: it.url, retrievedAt: new Date().toISOString() },
    tags: ['warning', category],
    props: { kind, category, military: kind !== 'navigation-warning' || category !== 'navigation warning', summary: it.summary, domain: it.domain, country: geo.country ?? (geo.kind === 'country' ? geo.name : undefined) },
  }
}

export const noticesProvider: Provider = {
  id: 'notices',
  layerId: 'warnings',
  ttlMs: 15 * 60_000,
  async fetch() {
    await Promise.all(FEEDS.map(async (f) => { const r = await pollFeed(f).catch(() => null); if (r) last.set(f.id, r) }))
    const seen = new Set<string>()
    const out: Feature[] = []
    for (const it of FEEDS.flatMap((f) => last.get(f.id) ?? [])) {
      if (seen.has(it.id) || Date.now() - it.published > 4 * 86_400_000) continue
      seen.add(it.id)
      const f = noticeFeature(it)
      if (f) out.push(f)
    }
    return out
  },
}
