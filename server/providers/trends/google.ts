import { XMLParser } from 'fast-xml-parser'
import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { centroidOf } from '../../geo/gazetteer.ts'

/**
 * What people are searching for, per country (Google Trends "trending now"
 * RSS, keyless). A surge of searches for explosions, protests or curfews is
 * often the first sign that something is happening, before newsrooms catch
 * up; it also shows what a population is worried about. One feature per
 * country, listing its trending searches and how many are security-related.
 */

// ISO 3166 code -> gazetteer country name.
const GEOS: Record<string, string> = {
  UA: 'Ukraine', RU: 'Russia', BY: 'Belarus', PL: 'Poland', RO: 'Romania', MD: 'Moldova', GE: 'Georgia', AM: 'Armenia',
  AZ: 'Azerbaijan', TR: 'Turkey', IL: 'Israel', SA: 'Saudi Arabia', AE: 'United Arab Emirates', EG: 'Egypt', IQ: 'Iraq',
  JO: 'Jordan', LB: 'Lebanon', MA: 'Morocco', DZ: 'Algeria', TN: 'Tunisia', NG: 'Nigeria', KE: 'Kenya', ZA: 'South Africa',
  ET: 'Ethiopia', GH: 'Ghana', SN: 'Senegal', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', NP: 'Nepal', LK: 'Sri Lanka',
  ID: 'Indonesia', PH: 'Philippines', TH: 'Thailand', VN: 'Vietnam', MY: 'Malaysia', TW: 'Taiwan', KR: 'South Korea', JP: 'Japan',
  US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil', AR: 'Argentina', CO: 'Colombia', PE: 'Peru', CL: 'Chile',
  VE: 'Venezuela', FR: 'France', DE: 'Germany', GB: 'United Kingdom', ES: 'Spain', IT: 'Italy', RS: 'Serbia', HU: 'Hungary', GR: 'Greece',
}

// Security vocabulary in the languages people search in (stems).
export const SECURITY = new RegExp(
  [
    'protest', 'riot', 'strike', 'explos', 'attack', 'missile', 'drone', 'airstrike', 'bomb', 'shooting', 'gunfire', 'coup', 'war\\b', 'troops',
    'curfew', 'martial law', 'terror', 'hostage', 'clash', 'evacuat', 'blackout', 'air raid', 'siren', 'mobiliz', 'invasion', 'ceasefire',
    'протест', 'митинг', 'взрыв', 'вибух', 'атак', 'ракет', 'дрон', 'обстрел', 'обстріл', 'теракт', 'войн', 'війн', 'мобилиз', 'мобіліз',
    'тревог', 'тривог', 'эвакуац', 'евакуац', 'блэкаут', 'відключен',
    'احتجاج', 'مظاهر', 'انفجار', 'هجوم', 'صاروخ', 'غارة', 'قصف', 'حرب', 'انقلاب', 'اعتراض', 'حمله', 'موشک', 'جنگ',
    'manif', 'grève', 'émeute', 'attentat', 'guerre', 'protesta', 'huelga', 'explosión', 'ataque', 'guerra', 'golpe',
    'streik', 'angriff', 'krieg', 'protesto', 'patlama', 'saldırı', 'füze', 'savaş', 'darbe', 'demo\\b', 'unjuk rasa', 'kerusuhan',
  ].join('|'),
  'i',
)

// Sport reuses the same words (striker, attack, "war of words" derby): a sports trend is never a security signal.
const SPORT = /\bvs\.?\b|\bv\b|football|soccer|fc\b|league|cup\b|match|goal|striker|nba|nfl|ufc|tennis|cricket|grand prix|formula|футбол|матч|сборная|збірна|ліга|лига|كأس|دوري|مباراة|منتخب|fútbol|partido|liga|coupe|ligue|fußball|bundesliga|maç|lig\b|sepak bola|piala/i

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true })
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

export const isSecurity = (text: string) => SECURITY.test(text) && !SPORT.test(text)

type Trend = { query: string; traffic: string; at: number; news: { title: string; url: string; source: string }[]; security: boolean }

async function country(geo: string, signal: AbortSignal): Promise<Trend[]> {
  const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, { headers: { 'user-agent': 'Mozilla/5.0 panoptes-research/0.1' }, signal })
  if (!res.ok) throw new Error(`HTTP ${res.status} trends.google.com`)
  const doc = parser.parse(await res.text())
  return arr(doc.rss?.channel?.item as Record<string, unknown>[]).map((it) => {
    const news = arr(it['ht:news_item'] as Record<string, string>[]).map((n) => ({ title: String(n['ht:news_item_title'] ?? ''), url: String(n['ht:news_item_url'] ?? ''), source: String(n['ht:news_item_source'] ?? '') }))
    const query = String(it.title ?? '')
    const t = Date.parse(String(it.pubDate ?? ''))
    return { query, traffic: String(it['ht:approx_traffic'] ?? ''), at: Number.isNaN(t) ? Date.now() : t, news: news.slice(0, 2), security: isSecurity([query, ...news.map((n) => n.title)].join(' ')) }
  })
}

export const googleTrendsProvider: Provider = {
  id: 'google-trends',
  layerId: 'trends',
  ttlMs: 15 * 60_000,
  async fetch({ signal }) {
    const now = new Date().toISOString()
    const out: Feature[] = []
    const queue = Object.entries(GEOS)
    let failed = 0
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const [geo, name] = next
          const pos = centroidOf(name)
          if (!pos) continue
          const trends = await country(geo, signal).catch(() => (failed++, null))
          if (!trends?.length) continue
          const sec = trends.filter((t) => t.security)
          out.push({
            id: `trends:${geo}`,
            layerId: 'trends',
            title: sec.length ? `${name}: ${sec.length} security search${sec.length > 1 ? 'es' : ''} trending (${sec[0].query})` : `${name}: trending searches`,
            // Pinned only when something security-related trends; the rest stay in the list.
            ...(sec.length ? { position: pos } : {}),
            geoPrecision: sec.length ? 'approximate' : 'none',
            geoBasis: `country-level trending searches (Google Trends, ${geo})`,
            observedAt: new Date(Math.max(...trends.map((t) => t.at))).toISOString(),
            source: { provider: 'google-trends', platform: 'trends.google.com', url: `https://trends.google.com/trending?geo=${geo}`, retrievedAt: now },
            tags: ['trends', ...(sec.length ? ['security'] : [])],
            props: { kind: 'trends', country: name, geo, securityTerms: sec.length, trends: [...sec, ...trends.filter((t) => !t.security)].slice(0, 12) },
          })
        }
      }),
    )
    if (!out.length && failed) throw new Error(`HTTP 429 trends.google.com (all ${failed} countries failed)`)
    return out
  },
}
