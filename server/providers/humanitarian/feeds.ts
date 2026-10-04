import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { centroidOf, scoreLocations } from '../../geo/gazetteer.ts'
import { pollFeed } from '../../news/ingest.ts'

/**
 * HUMANITARIAN & HEALTH: ReliefWeb (UN OCHA) reports and disasters, and WHO
 * Disease Outbreak News. Both name the country they concern; items sit at that
 * country's centre (precision `country`, stated), or where the title is more precise.
 */

function place(title: string, country?: string): { pos?: { lat: number; lon: number }; precision: Feature['geoPrecision']; basis: string; country?: string } {
  const geo = scoreLocations([{ text: title, weight: 2 }, ...(country ? [{ text: country }] : [])])
  if (geo && geo.kind !== 'country') return { pos: { lat: geo.lat, lon: geo.lon }, precision: 'inferred', basis: `${geo.name}, named in the title`, country: geo.country ?? country }
  const name = country ?? (geo?.kind === 'country' ? geo.name : undefined)
  const c = name ? (centroidOf(name) ?? (geo ? { lat: geo.lat, lon: geo.lon } : undefined)) : undefined
  // Report the gazetteer's own name for the country ("Democratic Republic of the Congo" -> "Congo"), so it matches the graph
  const canonical = geo?.kind === 'country' ? geo.name : name
  return c ? { pos: c, precision: 'approximate', basis: `country stated by the source (${name}); shown at its centre`, country: canonical } : { precision: 'none', basis: 'no country stated' }
}

const item = (id: string, title: string, at: number, url: string, platform: string, provider: string, props: Record<string, unknown>, country?: string): Feature => {
  const p = place(title, country)
  return {
    id: `humanitarian:${id}`,
    layerId: 'humanitarian',
    title,
    ...(p.pos ? { position: p.pos } : {}),
    geoPrecision: p.pos ? p.precision : 'none',
    geoBasis: p.basis,
    observedAt: new Date(at).toISOString(),
    source: { provider, platform, url, retrievedAt: new Date().toISOString() },
    tags: ['humanitarian', String(props.kind)],
    props: { ...props, country: p.country },
  }
}

const RW = [
  { id: 'rw-updates', url: 'https://reliefweb.int/updates/rss.xml', domain: 'reliefweb.int' },
  { id: 'rw-disasters', url: 'https://reliefweb.int/disasters/rss.xml', domain: 'reliefweb.int' },
]
const lastRw = new Map<string, Awaited<ReturnType<typeof pollFeed>>>()

export const reliefwebProvider: Provider = {
  id: 'reliefweb',
  layerId: 'humanitarian',
  ttlMs: 20 * 60_000,
  async fetch() {
    // ReliefWeb's edge answers 406 to some requests at random: one retry
    const get = (f: (typeof RW)[number]) => pollFeed(f).catch(() => pollFeed(f)).catch(() => null)
    await Promise.all(RW.map(async (f) => { const r = await get(f); if (r) lastRw.set(f.id, r) }))
    const out: Feature[] = []
    for (const f of RW)
      for (const it of lastRw.get(f.id) ?? []) {
        // "DR Congo: République démocratique du Congo ..." -> the country before the colon
        const m = /^([^:]{3,40}):\s*(.+)$/.exec(it.title)
        const country = m?.[1].replace(/^DR Congo$/, 'Democratic Republic of the Congo')
        out.push(item(`rw-${it.id}`, it.title, it.published, it.url, 'ReliefWeb (UN OCHA)', 'reliefweb.int', { kind: f.id === 'rw-disasters' ? 'disaster' : 'humanitarian', summary: it.summary, org: 'ReliefWeb' }, country))
      }
    return out
  },
}

export const whoProvider: Provider = {
  id: 'who-don',
  layerId: 'humanitarian',
  ttlMs: 60 * 60_000,
  async fetch({ signal }) {
    const r = await fetch('https://www.who.int/api/news/diseaseoutbreaknews?$orderby=PublicationDateAndTime%20desc&$top=15&$select=Title,PublicationDateAndTime,UrlName,Summary', { signal })
    if (!r.ok) throw new Error(`HTTP ${r.status} who.int`)
    const rows = ((await r.json()) as { value: { Title: string; PublicationDateAndTime: string; UrlName: string; Summary?: string }[] }).value ?? []
    return rows
      .filter((x) => Date.now() - Date.parse(x.PublicationDateAndTime) < 120 * 86_400_000)
      .map((x) => {
        // "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo"
        const parts = x.Title.split(/\s+[-–]\s+/)
        const country = parts.length > 1 ? parts.at(-1) : undefined
        return item(`who-${x.UrlName}`, `Outbreak: ${x.Title}`, Date.parse(x.PublicationDateAndTime), `https://www.who.int/emergencies/disease-outbreak-news/item/${x.UrlName}`, 'WHO Disease Outbreak News', 'who.int', { kind: 'outbreak', disease: parts[0], summary: (x.Summary ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500), org: 'WHO' }, country)
      })
  },
}
