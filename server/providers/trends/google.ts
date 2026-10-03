import { XMLParser } from 'fast-xml-parser'
import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { cached, refresh, trendsError } from '../../core/googletrends.ts'
import { centroidOf } from '../../geo/gazetteer.ts'

/**
 * What people are searching for, per country (Google Trends "trending now"
 * RSS, keyless). A surge of searches for explosions, protests or curfews is
 * often the first sign that something is happening, before newsrooms catch
 * up; it also shows what a population is worried about. One feature per
 * country, listing its trending searches and how many are security-related.
 */

// ISO 3166 code -> gazetteer country name. Kept to ~30: Google rate-limits trending RSS per IP.
const GEOS: Record<string, string> = {
  UA: 'Ukraine', RU: 'Russia', BY: 'Belarus', PL: 'Poland', MD: 'Moldova', GE: 'Georgia', TR: 'Turkey', IL: 'Israel',
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', EG: 'Egypt', IQ: 'Iraq', LB: 'Lebanon', NG: 'Nigeria', KE: 'Kenya',
  ZA: 'South Africa', ET: 'Ethiopia', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', ID: 'Indonesia', PH: 'Philippines',
  TW: 'Taiwan', KR: 'South Korea', US: 'United States', MX: 'Mexico', BR: 'Brazil', VE: 'Venezuela', FR: 'France', GB: 'United Kingdom',
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

function parse(xml: string): Trend[] {
  const doc = parser.parse(xml)
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
  // Never waits on Google: serves what the shared client has cached and queues refreshes in the background.
  async fetch() {
    const now = new Date().toISOString()
    const out: Feature[] = []
    for (const [geo, name] of Object.entries(GEOS)) {
      refresh(geo)
      const c = cached(geo)
      const pos = centroidOf(name)
      if (!c || !pos) continue
      const trends = parse(c.xml)
      if (!trends.length) continue
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
    if (!out.length && trendsError()) throw new Error(trendsError())
    return out
  },
}
