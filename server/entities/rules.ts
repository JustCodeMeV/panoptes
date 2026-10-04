import type { EventKind, Precision, Role } from '../../shared/entities.ts'
import type { Feature } from '../../shared/feature.ts'
import { scoreLocations } from '../geo/gazetteer.ts'
import { fatalities } from '../providers/conflict/wikicurrent.ts'
import { CHANNELS } from '../telegram/channels.ts'
import { outletInfo, socialSource } from '../truth/domains.ts'
import { ACTORS } from './actors.ts'
import { link, slug, upsertEntity } from './graph.ts'

/**
 * Free, rules-only extraction that runs on EVERY entry: what kind of event,
 * where, who (with a guessed role), who reported it, and what is claimed.
 * Claude refines the important entries later (server/entities/llm.ts).
 */

// ---------- event kind ----------

const KINDS: [EventKind, RegExp][] = [
  ['missile-test', /\b(test-fired|missile (?:test|drill|launch)|hypersonic|ballistic missile launch)/i],
  ['drone-attack', /\b(drones? (?:attack|strike)|drone strikes?|uavs?\b|shahed|kamikaze drone)|бпла|дрон|مسير/i],
  ['strike', /\b(air ?strikes?|air raids?|bomb(?:ed|ing|s)?|missile (?:attack|strike)s?|strikes? (?:on|against|hit)|struck|rocket fire|rockets? (?:hit|fired))|ракет|удар|غارة|قصف/i],
  ['shelling', /\b(shell(?:ing|ed|s)|artillery|mortar)|обстр[іе]л/i],
  ['clash', /\b(clash(?:es|ed)?|fighting|firefight|battle|offensive|ambush|recaptur|captur(?:e|ed|es) (?:the )?(?:town|village|city)|gunmen|insurgents? attack)|бо[їи]|اشتباك/i],
  ['explosion', /\b(explosions?|blasts?|exploded|detonat)|взрыв|вибух|انفجار/i],
  ['protest', /\b(protests?|protesters?|rall(?:y|ies)|demonstrat|march(?:es|ed)? against|riots?|unrest|sit-in)|протест|митинг|احتجاج|مظاهر/i],
  ['arrest', /\b(arrest(?:s|ed)?|detain(?:s|ed)?|custody|raid(?:s|ed)? on homes?)/i],
  ['ceasefire', /\b(ceasefire|cease-fire|truce|hostage (?:deal|release)|prisoner (?:swap|exchange))|перемир/i],
  ['talks', /\b(talks|negotiat|summit|meets?|met with|visit(?:s|ed)?|phone call)\b/i],
  ['sanction', /\bsanction/i],
  ['cyber', /\b(cyber ?attack|hack(?:ed|ers?)|ddos|ransomware|data breach)/i],
  ['disaster', /\b(earthquake|flood(?:s|ing)?|wildfire|cyclone|typhoon|hurricane|landslide|tsunami)/i],
]
export const kindOf = (text: string): EventKind => KINDS.find(([, re]) => re.test(text))?.[0] ?? 'other'

// ---------- actors ----------

type ActorMatch = { id: string; name: string; at: number; role: Role }
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ACTOR_RES = ACTORS.flatMap(([name, subtype, country, ...aliases]) =>
  [name, ...aliases].map((a) => ({
    name,
    subtype,
    country,
    aliases,
    re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(a)}(?![\\p{L}\\p{N}])`, a.length <= 4 ? 'u' : 'iu'),
  })),
)
export const actorId = (name: string) => `actor:${slug(name)}`

const ACTION = /\b(strikes?|struck|attacks?|attacked|shells?|shelled|hits?|bombs?|bombed|kills?|killed|targets?|targeted|raids?|raided|fires? on|launch(?:es|ed)? .{0,20}at|shoots? down|downs?|intercepts?|intercepted|captures?|captured|arrests?|arrested)\b/i
const CLAIMS = /\b(says?|said|claims?|claimed|reports?|reported|accuses?|accused|warns?|announces?|announced|confirms?|confirmed)\b/i
const DENIES = /\b(denies|denied|rejects?|rejected|dismiss(?:es|ed)?)\b/i

/** Actors named in a text, with a role guessed from word order around the action verb. */
export function actorsIn(text: string): ActorMatch[] {
  const found = new Map<string, ActorMatch>()
  for (const a of ACTOR_RES) {
    const m = a.re.exec(text)
    if (!m) continue
    const id = actorId(a.name)
    const prev = found.get(id)
    if (!prev || m.index < prev.at) found.set(id, { id, name: a.name, at: m.index, role: 'participant' })
    upsertEntity({ id, type: 'actor', subtype: a.subtype, label: a.name, props: { country: a.country, aliases: a.aliases }, firstSeen: Date.now(), lastSeen: Date.now(), confidence: 0.9 })
  }
  const list = [...found.values()].sort((x, y) => x.at - y.at)
  const act = ACTION.exec(text)
  const claim = CLAIMS.exec(text)
  for (const m of list) {
    if (act) m.role = m.at < act.index ? 'attacker' : 'target'
    if (claim && m.at < claim.index && (!act || claim.index < act.index)) m.role = 'claimant'
  }
  return list
}

// ---------- sources ----------

const CH = new Map(CHANNELS.map((c) => [c.handle.toLowerCase(), c]))

/** Source entity for an outlet domain, a Telegram channel (t.me/x) or a Bluesky account. */
export function sourceEntity(domain: string, at: number): string {
  const d = domain.toLowerCase()
  const id = `source:${slug(d)}`
  if (d.startsWith('t.me/')) {
    const ch = CH.get(d.slice(5))
    upsertEntity({
      id, type: 'source', subtype: 'channel', label: ch ? `${ch.name} (@${ch.handle})` : `@${domain.slice(5)}`,
      props: { domain: d, url: `https://t.me/s/${domain.slice(5)}`, tier: ch?.tier, channelType: ch?.type, bloc: ch?.bloc, ownership: ch?.type === 'state' || ch?.type === 'gov' ? 'state' : 'private' },
      firstSeen: at, lastSeen: at, confidence: 1,
    })
  } else if (socialSource(d)) {
    upsertEntity({ id, type: 'source', subtype: 'account', label: domain.replace(/^bsky:/, '@'), props: { domain: d, ownership: 'private' }, firstSeen: at, lastSeen: at, confidence: 1 })
  } else {
    const o = outletInfo(d)
    upsertEntity({ id, type: 'source', subtype: 'outlet', label: d, props: { domain: d, url: `https://${d}`, ownership: o?.own, country: o?.country, note: o?.note }, firstSeen: at, lastSeen: at, confidence: 1 })
  }
  return id
}

// ---------- locations ----------

const PREC: Record<string, Precision> = { place: 'town', country: 'country' }

export function locationEntity(name: string, lat: number, lon: number, precision: Precision, country: string | undefined, at: number): string {
  const id = `location:${slug(name)}`
  upsertEntity({ id, type: 'location', subtype: precision, label: name, props: { country }, position: { lat, lon }, precision, firstSeen: at, lastSeen: at, confidence: 0.8 })
  return id
}

// ---------- one entry -> entities ----------

export type Report = {
  featureId: string
  url?: string
  title: string
  text: string
  at: number
  sources: { domain: string; url?: string; title?: string; at: number }[]
  position?: { lat: number; lon: number }
  /** Feature verdict from the truth engine, when there is one. */
  verdict?: string
  /** Conflict-log entries carry their own event type. */
  kindHint?: EventKind
  casualties?: number
  /** Actors the source states explicitly (e.g. ransomware group and victim), beyond what the text names. */
  actors?: { name: string; subtype: string; role: Role; props?: Record<string, unknown> }[]
}

/** Normalises any layer's feature into a report, or null when the layer carries no events. */
export function reportOf(f: Feature): Report | null {
  const at = Date.parse(f.observedAt) || Date.now()
  const p = f.props
  if (f.layerId === 'news') {
    const a = p.assessment as { campaign?: { timeline?: { at: number; source: string; title: string; url: string }[] }; coverage?: { articles?: { url: string; title: string; domain: string; seen: string }[] } } | undefined
    const tl = a?.campaign?.timeline ?? []
    const sources = tl.length ? tl.map((i) => ({ domain: i.source, url: i.url, title: i.title, at: i.at })) : [{ domain: f.source.platform, url: f.source.url, title: f.title, at }]
    return { featureId: f.id, url: f.source.url, title: f.title, text: [f.title, ...sources.map((s) => s.title ?? '')].join(' \n '), at, sources, verdict: String(p.verdict ?? '') }
  }
  if (f.layerId === 'telegram') {
    const text = String(p.text ?? f.title)
    const sources = [{ domain: `t.me/${String(p.handle)}`, url: f.source.url, title: f.title, at }]
    return { featureId: f.id, url: f.source.url, title: f.title, text, at, sources, position: f.position }
  }
  if (f.layerId === 'acled') {
    const text = String(p.notes ?? f.title)
    const kind: EventKind = p.eventType === 'Disaster' ? 'disaster' : kindOf(text)
    return { featureId: f.id, url: f.source.url, title: f.title, text: `${text} ${String(p.context ?? '')}`, at, sources: [{ domain: f.source.url ? new URL(f.source.url).hostname.replace(/^www\./, '') : 'wikipedia.org', url: f.source.url, title: f.title, at }], position: f.position, kindHint: kind === 'other' ? 'clash' : kind, casualties: Number(p.fatalities) || undefined }
  }
  if (f.layerId === 'cyber' && p.kind === 'ransomware') {
    const text = `${String(p.group)} ransomware group claims an attack on ${String(p.victim)}${p.sector ? ` (${String(p.sector)})` : ''}${p.country ? ` in ${String(p.country)}` : ''}. ${String(p.description ?? '')}`
    return {
      featureId: f.id, url: f.source.url, title: f.title, text, at, position: f.position, kindHint: 'cyber',
      sources: [{ domain: 'ransomware.live', url: f.source.url, title: f.title, at }],
      actors: [
        { name: String(p.group), subtype: 'threat-actor', role: 'attacker', props: { kind: 'ransomware group' } },
        { name: String(p.victim), subtype: 'org', role: 'victim', props: { sector: p.sector, domain: p.domain, country: p.country } },
      ],
    }
  }
  if (f.layerId === 'osint' || f.layerId === 'x') {
    const cat = String(p.category ?? '')
    const kind: EventKind = /outage|censor|block/i.test(cat) ? 'cyber' : /quake|flood|cyclone|volcan|fire|disaster|storm/i.test(`${cat} ${f.title}`) ? 'disaster' : kindOf(f.title)
    let domain = f.source.platform
    try {
      if (f.source.url) domain = new URL(f.source.url).hostname.replace(/^www\./, '')
    } catch {
      /* keep platform */
    }
    return { featureId: f.id, url: f.source.url, title: f.title, text: `${f.title} ${String(p.summary ?? p.text ?? '')}`, at, position: f.position, kindHint: kind, sources: [{ domain, url: f.source.url, title: f.title, at }] }
  }
  if (f.layerId === 'unrest') {
    const arts = (p.articles as { url: string; title: string; at: number }[] | undefined) ?? []
    const kind: EventKind = p.dominant === 'protest' ? 'protest' : p.dominant === 'armed clash' || p.dominant === 'mass violence' ? 'clash' : 'other'
    return {
      featureId: f.id, url: f.source.url, title: f.title, text: arts.map((x) => x.title).join(' \n '), at, position: f.position, kindHint: kind,
      sources: arts.map((x) => ({ domain: new URL(x.url).hostname.replace(/^www\./, ''), url: x.url, title: x.title, at: x.at })),
    }
  }
  return null
}

/** Writes one report into the graph; returns the event entity id it created or reinforced. */
export function ingestReport(r: Report): string | null {
  const kind = r.kindHint ?? kindOf(r.text)
  // Telegram chatter with no event and no place is not an event.
  if (kind === 'other' && r.featureId.startsWith('telegram:')) return null
  const geo = scoreLocations([{ text: r.title, weight: 3 }, { text: r.text.slice(0, 1500), weight: 1 }])
  const pos = r.position ?? (geo ? { lat: geo.lat, lon: geo.lon } : undefined)
  const precision: Precision = geo ? (PREC[geo.kind] ?? 'country') : r.position ? 'town' : 'none'
  const casualties = r.casualties ?? (fatalities(r.text) || undefined)
  const id = `event:${slug(r.featureId)}`
  upsertEntity({
    id, type: 'event', subtype: kind, label: r.title.length > 120 ? r.title.slice(0, 117) + '…' : r.title,
    props: { kind, casualties, featureIds: [r.featureId], verdict: r.verdict || undefined, text: r.text.slice(0, 600) },
    position: pos, precision, firstSeen: r.at, lastSeen: Math.max(r.at, ...r.sources.map((s) => s.at)), confidence: kind === 'other' ? 0.4 : 0.6,
  })
  const ev = { featureId: r.featureId, url: r.url, quote: r.title.slice(0, 200) }
  if (geo && pos) link(id, 'located_at', locationEntity(geo.name, geo.lat, geo.lon, precision, geo.country, r.at), { at: r.at, evidence: ev, confidence: geo.confidence })
  for (const s of r.sources) link(id, 'reported_by', sourceEntity(s.domain, s.at), { at: s.at, evidence: { featureId: r.featureId, url: s.url, quote: s.title?.slice(0, 200) }, confidence: 0.9 })
  for (const a of actorsIn(r.text.slice(0, 2000))) link(id, 'involves', a.id, { role: a.role, at: r.at, evidence: ev, confidence: 0.55 })
  for (const a of r.actors ?? []) {
    const aid = actorId(a.name)
    upsertEntity({ id: aid, type: 'actor', subtype: a.subtype, label: a.name, props: a.props ?? {}, firstSeen: r.at, lastSeen: r.at, confidence: 0.9 })
    link(id, 'involves', aid, { role: a.role, at: r.at, evidence: ev, confidence: 0.9 })
  }
  // Claims: "X says ..." / "X denies ...": who asserts what about this event.
  const head = r.title
  if (CLAIMS.test(head) || DENIES.test(head)) {
    const claimant = actorsIn(head).find((a) => a.role === 'claimant') ?? actorsIn(head)[0]
    const cid = `claim:${slug(r.featureId)}`
    upsertEntity({ id: cid, type: 'claim', subtype: DENIES.test(head) ? 'denial' : 'assertion', label: head.slice(0, 140), props: { statement: head, stance: DENIES.test(head) ? 'denies' : 'asserts' }, firstSeen: r.at, lastSeen: r.at, confidence: 0.5 })
    link(cid, 'about', id, { at: r.at, evidence: ev })
    const by = claimant?.id ?? (r.sources[0] ? sourceEntity(r.sources[0].domain, r.at) : undefined)
    if (by) link(by, 'claims', cid, { at: r.at, evidence: ev })
  }
  return id
}
