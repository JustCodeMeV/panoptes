import { unzipSync, strFromU8 } from 'fflate'

/**
 * GDELT 2.0 event export: a new tab-separated file every 15 minutes, no key.
 * Columns used (0-based): 26 EventCode, 28 EventRootCode, 30 Goldstein,
 * 12/22 Actor1/2 Type, 31 NumMentions, 32 NumSources, 34 AvgTone, 51 ActionGeo_Type, 52 name,
 * 53 country, 56/57 lat/lon, 59 DATEADDED, 60 SOURCEURL.
 */
export type GdeltEvent = {
  id: string
  at: number
  root: string
  code: string
  mentions: number
  sources: number
  tone: number
  goldstein: number
  geoType: number
  /** GDELT Actor1Type1Code / Actor2Type1Code (MIL, GOV, REB, COP, CRM, ...). */
  actor1Type?: string
  actor2Type?: string
  place: string
  country: string
  lat: number
  lon: number
  url: string
}

/** CAMEO root codes we treat as unrest/violence. */
export const ROOT_LABEL: Record<string, string> = {
  '14': 'protest',
  '15': 'show of force',
  '17': 'coercion',
  '18': 'assault',
  '19': 'armed clash',
  '20': 'mass violence',
}

/** Readable headline from a URL slug (GDELT export carries no titles). */
export function titleFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    const slug = [...parts].reverse().find((p) => /[a-z]{3,}-[a-z]{3,}/i.test(p)) ?? parts[parts.length - 1] ?? ''
    const t = decodeURIComponent(slug).replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ').replace(/\b\d{5,}\b/g, '').trim()
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : new URL(url).hostname
  } catch {
    return url
  }
}

// ---- relevance: GDELT codes every article with a verb like "attack" or "fight" ----
// Local crime, entertainment ("Netflix's new thriller"), sport and lifestyle pieces all land in the
// violence codes. An event is kept only when its article is plausibly about political unrest or
// armed conflict: judged from the headline when the URL carries one, otherwise from the actors.

/** Conflict / political-unrest vocabulary in a headline (stems, English). */
const CONFLICT = new RegExp(
  '\\b(' +
    [
      'protest', 'protester', 'demonstrat', 'rall(?:y|ies)\\b', 'march(?:es|ed)?', 'riots?\\b', 'rioter', 'unrest', 'uprising', 'clash', 'crackdown',
      'tear ?gas', 'curfew', 'martial', 'coup\\b', 'junta', 'strike(?:s)? (?:on|against|hit)', 'airstrike', 'air strike', 'missile', 'rocket',
      'drone', 'shelling', 'shell(?:ed|s)', 'bomb', 'blasts?\\b', 'explosion', 'artillery', 'offensive', 'invasion', 'incursion', 'raids?\\b', 'ambush',
      'militant', 'militia', 'insurgen', 'rebel', 'jihad', 'terror', 'hostage', 'ceasefire', 'truce', 'troops', 'soldier', 'army\\b', 'armies', 'military',
      'navy\\b', 'warship', 'frontline', 'front line', 'wars?\\b', 'warfare', 'genocide', 'massacre', 'killed in (?:an? )?(?:attack|strike|raid|clash)',
      'border\\b', 'sanction', 'annex', 'occupation', 'occupied', 'separatist', 'insurrection', 'election violence', 'opposition', 'dissident',
      'political prisoner', 'detained activist', 'houthi', 'hamas', 'hezbollah', 'taliban', 'isis\\b', 'al.?shabaab', 'boko haram', 'wagner', 'idf\\b',
      'irgc', 'pkk\\b', 'rsf\\b', 'cartel violence', 'nuclear test', 'missile test', 'mobiliz',
    ].join('|') +
    ')',
  'i',
)

/** Clearly not unrest: entertainment, sport, lifestyle, everyday crime and accidents. */
const NOT_UNREST =
  /\b(netflix|hulu|disney|movie|film|trailer|box office|season \d|episode|tv show|shows to watch|series|novel|book|goodreads|album|song|concert|festival|celebrity|actor|actress|star wars|marvel|video game|gaming|playstation|xbox|nintendo|recipe|horoscope|fashion|horse racing|racing|nfl|nba|mlb|nhl|soccer|football|cricket|tennis|golf|ufc|boxing match|car wreck|crash|collision|stabbing|carjack|burglary|robbery|shoplift|dui|homicide|murder suspect|sentenced|convicted|trial|lawsuit|obituary|podcast|horror|thriller)\b/i

/** Outlets that publish no conflict reporting; anything they "code" as violence is noise. */
const NOISE_DOMAINS =
  /(^|\.)(womansworld|howtogeek|kotaku|hollywoodreporter|variety|deadline|ign|polygon|eurogamer|gamespot|tmz|people|eonline|usmagazine|bloodhorse|espn|bleacherreport|si|goal|skysports|cnet|theverge|engadget|gizmodo|buzzfeed|refinery29|eater|allrecipes|ibtimes)\.(com|co\.uk|net)$/i

/** GDELT actor type codes that make an event political or military (police and courts alone do not). */
const POLITICAL_ACTORS = new Set(['MIL', 'GOV', 'REB', 'INS', 'SEP', 'UAF', 'OPP', 'SPY', 'RAD', 'MOD', 'IGO', 'PTY', 'LEG', 'ELI', 'NGM'])

/** A headline is "readable" when the slug has several real words (not an id or a hash). */
const readable = (t: string) => (t.match(/[a-z]{3,}/gi) ?? []).length >= 4

export function isRelevant(e: { root: string; url: string; actor1Type?: string; actor2Type?: string }): boolean {
  let host = ''
  try {
    host = new URL(e.url).hostname.replace(/^www\./, '')
  } catch {
    return false
  }
  if (NOISE_DOMAINS.test(host)) return false
  const title = titleFromUrl(e.url)
  // titleFromUrl falls back to the hostname when the path has no words: that is not a headline.
  if (title !== new URL(e.url).hostname && readable(title)) return CONFLICT.test(title) && !NOT_UNREST.test(title)
  // No usable headline: trust the coding only when a political or military actor is involved (or it is a protest).
  return e.root === '14' || POLITICAL_ACTORS.has(e.actor1Type ?? '') || POLITICAL_ACTORS.has(e.actor2Type ?? '')
}

const UA = { 'user-agent': 'Mozilla/5.0 panoptes-research/0.1' }
const BASE = 'http://data.gdeltproject.org/gdeltv2/'

const pad = (n: number) => String(n).padStart(2, '0')
export const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`

export function parseStamp(s: string): number {
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12))
}

export function parseExport(tsv: string): GdeltEvent[] {
  const out: GdeltEvent[] = []
  for (const line of tsv.split('\n')) {
    const c = line.split('\t')
    if (c.length < 61) continue
    const root = c[28]
    if (!ROOT_LABEL[root]) continue
    const lat = parseFloat(c[56])
    const lon = parseFloat(c[57])
    const geoType = parseInt(c[51], 10)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    // City-level only (3 = US city, 4 = world city). Country/state centroids are not event locations.
    if ((geoType !== 3 && geoType !== 4) || !c[60]) continue
    const ev = { root, url: c[60], actor1Type: c[12] || undefined, actor2Type: c[22] || undefined }
    if (!isRelevant(ev)) continue
    out.push({
      id: c[0],
      at: c[59] ? parseStamp(c[59]) : Date.now(),
      root,
      code: c[26],
      mentions: parseInt(c[31], 10) || 1,
      sources: parseInt(c[32], 10) || 1,
      tone: parseFloat(c[34]) || 0,
      goldstein: parseFloat(c[30]) || 0,
      geoType,
      actor1Type: ev.actor1Type,
      actor2Type: ev.actor2Type,
      place: c[52],
      country: c[53],
      lat,
      lon,
      url: c[60],
    })
  }
  return out
}

/** Try a timestamped file; `null` when it does not exist (404 = not published yet). */
export async function fetchExport(ts: string): Promise<GdeltEvent[] | null> {
  const res = await fetch(`${BASE}${ts}.export.CSV.zip`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GDELT export ${ts} HTTP ${res.status}`)
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
  const name = Object.keys(files)[0]
  return name ? parseExport(strFromU8(files[name])) : []
}

export async function latestStamp(): Promise<string> {
  const res = await fetch(`${BASE}lastupdate.txt`, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`GDELT lastupdate HTTP ${res.status}`)
  const m = (await res.text()).match(/(\d{14})\.export/)
  if (!m) throw new Error('GDELT lastupdate: no export file')
  return m[1]
}
