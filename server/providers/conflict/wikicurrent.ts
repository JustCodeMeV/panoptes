import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { scoreLocations } from '../../geo/gazetteer.ts'
import { hash, stripHtml } from '../../truth/text.ts'

/**
 * Wikipedia's Current Events portal: a human-curated daily log of armed
 * conflicts, attacks and disasters, each item citing its source. Keyless, and
 * the open stand-in for ACLED while ACLED access is pending. Today and the two
 * previous days are read; each leaf item becomes an event, located from its
 * text (the conflict it belongs to only nudges the location).
 */

const SECTIONS: Record<string, string> = { 'Armed conflicts and attacks': 'Armed conflict', 'Disasters and accidents': 'Disaster' }
const UA = 'panoptes-research/0.1 (hackathon OSINT demo; https://panoptes-fxcj.onrender.com)'

type Item = { section: string; text: string; context: string[]; source?: string; sourceUrl?: string }

/** Leaf list items of the wanted sections, with the chain of parent items (conflict > campaign > ...). */
export function parseDay(html: string): Item[] {
  const out: Item[] = []
  const content = html.split('current-events-content description')[1] ?? ''
  const parts = content.split(/<p><b>([^<]+)<\/b>\s*<\/p>/)
  for (let i = 1; i < parts.length; i += 2) {
    const section = SECTIONS[parts[i].trim()]
    if (!section) continue
    const stack: string[] = []
    let buf = ''
    let hasChild = false
    // Walk tags: text before a nested <ul> is the parent's label; a </li> with no nested list is a leaf.
    for (const tok of parts[i + 1].split(/(<\/?ul>|<li>|<\/li>)/)) {
      if (tok === '<li>') {
        buf = ''
        hasChild = false
      } else if (tok === '<ul>') {
        if (buf.trim()) stack.push(tidy(stripHtml(buf)))
        buf = ''
        hasChild = true
      } else if (tok === '</ul>') {
        stack.pop()
      } else if (tok === '</li>') {
        if (!hasChild && buf.trim()) {
          const src = [...buf.matchAll(/class="external text" href="([^"]+)">\(([^)]+)\)<\/a>/g)].pop()
          const text = tidy(stripHtml(buf.replace(/<a rel="nofollow" class="external text"[^>]*>\([^)]*\)<\/a>/g, '')))
          if (text.length > 20) out.push({ section, text, context: [...stack], source: src?.[2], sourceUrl: src?.[1] })
        }
        buf = ''
        hasChild = true // closing a child: the parent is not a leaf
      } else buf += tok
    }
  }
  return out
}

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, dozens: 24,
}
const N = `(\\d{1,4}|${Object.keys(WORDS).join('|')})`
const KILLED = new RegExp(`(?:kill(?:s|ing|ed)?|death toll[^.]*?(?:rises|risen) to|at least)\\s+${N}|${N}\\s+(?:\\w+\\s+){0,2}(?:are|were|is|was)?\\s*(?:killed|dead|die)`, 'i')
/** Deaths stated in an entry ("Eighteen people are killed", "death toll rises to 10"), 0 if none. */
export const fatalities = (t: string) => {
  const m = t.match(KILLED)
  const v = (m?.[1] ?? m?.[2])?.toLowerCase()
  return v ? (WORDS[v] ?? Number(v)) || 0 : 0
}
const tidy = (t: string) => t.replace(/\s+([,.;:)'’])/g, '$1').replace(/\(\s+/g, '(')

const pageFor = (d: Date) => `Portal:Current_events/${d.getUTCFullYear()}_${d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })}_${d.getUTCDate()}`

export const wikiCurrentProvider: Provider = {
  id: 'wikipedia-current-events',
  layerId: 'acled',
  ttlMs: 30 * 60_000,
  async fetch({ signal }) {
    const now = new Date()
    const out: Feature[] = []
    for (let back = 0; back < 3; back++) {
      const day = new Date(now.getTime() - back * 86400_000)
      const page = pageFor(day)
      const res = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2`, { headers: { 'user-agent': UA }, signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} en.wikipedia.org`)
      const j = (await res.json()) as { parse?: { text?: string } }
      if (!j.parse?.text) continue // today's page may not exist yet
      const date = day.toISOString().slice(0, 10)
      for (const it of parseDay(j.parse.text)) {
        const geo = scoreLocations([{ text: it.text, weight: 3 }, { text: it.context.join(' · '), weight: 1 }])
        out.push({
          id: `acled:wiki:${hash(date + it.text)}`,
          layerId: 'acled',
          title: it.text.length > 140 ? it.text.slice(0, 137) + '…' : it.text,
          ...(geo ? { position: { lat: geo.lat, lon: geo.lon } } : {}),
          geoPrecision: geo ? 'inferred' : 'none',
          geoBasis: geo ? `entry names "${geo.name}"${geo.kind === 'place' && geo.country ? ` (${geo.country})` : ''}` : 'no place named in the entry',
          observedAt: new Date(`${date}T12:00:00Z`).toISOString(),
          source: { provider: 'wikipedia-current-events', platform: 'wikipedia', url: it.sourceUrl ?? `https://en.wikipedia.org/wiki/${page}`, retrievedAt: now.toISOString() },
          tags: ['conflict', it.section === 'Disaster' ? 'disaster' : 'armed-conflict', 'wikipedia'],
          props: {
            kind: 'wiki',
            eventType: it.section,
            subType: it.context[it.context.length - 1] ?? it.section,
            notes: it.text,
            context: it.context.join(' › '),
            fatalities: fatalities(it.text),
            sources: it.source ? `${it.source} via Wikipedia` : 'Wikipedia Current Events',
            date,
          },
        })
      }
    }
    return out
  },
}
