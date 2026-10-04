import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { countryOfCode, jitter } from './common.ts'

/**
 * Botnet command-and-control servers (abuse.ch Feodo Tracker, keyless):
 * Dridex, Emotet, QakBot... grouped per country and malware family.
 */
type C2 = { ip_address: string; port: number; status: string; hostname: string | null; as_number: number; as_name: string; country: string; first_seen: string; last_online: string | null; malware: string }

export const feodoProvider: Provider = {
  id: 'feodo-tracker',
  layerId: 'cyber',
  ttlMs: 60 * 60_000,
  async fetch({ signal }) {
    const r = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist.json', { headers: { 'user-agent': 'argus-research/0.1' }, signal })
    if (!r.ok) throw new Error(`HTTP ${r.status} feodotracker.abuse.ch`)
    const list = (await r.json()) as C2[]
    const groups = new Map<string, C2[]>()
    for (const c of list) groups.set(`${c.country}|${c.malware}`, [...(groups.get(`${c.country}|${c.malware}`) ?? []), c])
    const now = new Date().toISOString()
    const out: Feature[] = []
    for (const [key, cs] of groups) {
      const [cc, malware] = key.split('|')
      const c = countryOfCode(cc)
      if (!c) continue
      const online = cs.filter((x) => x.status === 'online').length
      const j = jitter(key, 1.6)
      out.push({
        id: `cyber:c2:${cc}:${malware}`,
        layerId: 'cyber',
        title: `${malware} command servers in ${c.name}: ${cs.length}${online ? ` (${online} online)` : ''}`,
        position: { lat: c.lat + j.dLat, lon: c.lon + j.dLon },
        geoPrecision: 'approximate',
        geoBasis: `servers hosted in ${c.name} (IP geolocation), spread around its centre`,
        observedAt: new Date(Math.max(...cs.map((x) => Date.parse(x.last_online ?? x.first_seen) || 0))).toISOString(),
        source: { provider: 'feodo-tracker', platform: 'abuse.ch', url: 'https://feodotracker.abuse.ch/browse/', retrievedAt: now },
        tags: ['cyber', 'botnet', malware],
        props: { kind: 'c2', malware, country: c.name, servers: cs.length, online, hosts: cs.slice(0, 8).map((x) => ({ ip: x.ip_address, port: x.port, as: x.as_name, status: x.status })) },
      })
    }
    return out
  },
}
