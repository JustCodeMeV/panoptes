import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { hash } from '../../truth/text.ts'
import { countryOfCode, jitter } from './common.ts'

/**
 * Ransomware victims claimed on leak sites in the last days (ransomware.live,
 * keyless). A claim is the group's assertion, not a confirmed breach: the UI
 * says so. Pinned at the victim's country (precision: country).
 */
type Victim = { victim: string; group: string; country?: string; activity?: string; attackdate?: string; discovered?: string; domain?: string; description?: string; url?: string }

export const ransomwareProvider: Provider = {
  id: 'ransomware-live',
  layerId: 'cyber',
  ttlMs: 20 * 60_000,
  async fetch({ signal }) {
    const r = await fetch('https://api.ransomware.live/v2/recentvictims', { headers: { 'user-agent': 'argus-research/0.1' }, signal })
    if (!r.ok) throw new Error(`HTTP ${r.status} ransomware.live`)
    const list = (await r.json()) as Victim[]
    const now = new Date().toISOString()
    return list.map((v): Feature => {
      const c = countryOfCode(v.country)
      const j = jitter(v.victim)
      const at = v.discovered ?? v.attackdate ?? now
      return {
        id: `cyber:ransom:${hash(`${v.group}:${v.victim}`)}`,
        layerId: 'cyber',
        title: `${v.group} claims ${v.victim}`,
        ...(c ? { position: { lat: c.lat + j.dLat, lon: c.lon + j.dLon } } : {}),
        geoPrecision: c ? 'approximate' : 'none',
        geoBasis: c ? `victim's country: ${c.name} (spread around its centre)` : 'victim country not stated',
        observedAt: new Date(at).toISOString(),
        source: { provider: 'ransomware-live', platform: 'ransomware.live', url: `https://www.ransomware.live/group/${encodeURIComponent(v.group)}`, retrievedAt: now },
        tags: ['cyber', 'ransomware', v.group],
        props: { kind: 'ransomware', group: v.group, victim: v.victim, country: c?.name, sector: v.activity, domain: v.domain || undefined, description: v.description?.slice(0, 300), claimedAt: v.attackdate },
      }
    })
  },
}
