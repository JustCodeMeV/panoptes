import { degreesLat, degreesLong, eciToGeodetic, gstime, json2satrec, propagate, type OMMJsonObject, type SatRec } from 'satellite.js'
import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'

/**
 * Satellites overhead right now: military, reconnaissance/radar, Earth
 * observation, navigation and crewed stations. Orbital elements come from
 * CelesTrak (keyless, refreshed every 6 h); positions are propagated with
 * SGP4 on every request, so pins move as the layer refreshes.
 */

const GROUPS: { id: string; label: string }[] = [
  { id: 'military', label: 'Military' },
  { id: 'radar', label: 'Radar calibration' },
  { id: 'resource', label: 'Earth observation' },
  { id: 'gnss', label: 'Navigation (GNSS)' },
  { id: 'stations', label: 'Crewed stations' },
]
const ELEMENTS_TTL = 6 * 3600_000

type Sat = { name: string; norad: number; group: string; intlId: string; rec: SatRec; incl: number; periodMin: number }
let sats: Sat[] = []
let loadedAt = 0

async function loadElements(signal: AbortSignal) {
  const out: Sat[] = []
  const seen = new Set<number>()
  type Omm = OMMJsonObject & { MEAN_MOTION: number; INCLINATION: number }
  const lists = await Promise.all(
    GROUPS.map(async (g) => {
      const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g.id}&FORMAT=json`, { headers: { 'user-agent': 'panoptes-research/0.1' }, signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} celestrak.org`)
      return { g, list: (await res.json()) as Omm[] }
    }),
  )
  for (const { g, list } of lists) {
    for (const o of list) {
      if (seen.has(Number(o.NORAD_CAT_ID))) continue
      seen.add(Number(o.NORAD_CAT_ID))
      out.push({ name: o.OBJECT_NAME, norad: Number(o.NORAD_CAT_ID), group: g.label, intlId: o.OBJECT_ID, rec: json2satrec(o), incl: Number(o.INCLINATION), periodMin: 1440 / Number(o.MEAN_MOTION) })
    }
  }
  sats = out
  loadedAt = Date.now()
}

/** Sub-satellite point and altitude at a time, or null if SGP4 fails (decayed / bad elements). */
export function subpoint(rec: SatRec, at: Date): { lat: number; lon: number; altKm: number; speedKms: number } | null {
  const pv = propagate(rec, at)
  if (!pv || typeof pv.position === 'boolean' || !pv.position || !pv.velocity || typeof pv.velocity === 'boolean') return null
  const g = eciToGeodetic(pv.position, gstime(at))
  const v = pv.velocity
  return { lat: degreesLat(g.latitude), lon: degreesLong(g.longitude), altKm: g.height, speedKms: Math.hypot(v.x, v.y, v.z) }
}

export const celestrakProvider: Provider = {
  id: 'celestrak',
  layerId: 'satellites',
  ttlMs: 20_000,
  async fetch({ signal }) {
    if (!sats.length || Date.now() - loadedAt > ELEMENTS_TTL) await loadElements(signal)
    const now = new Date()
    const out: Feature[] = []
    for (const s of sats) {
      const p = subpoint(s.rec, now)
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue
      out.push({
        id: `satellites:${s.norad}`,
        layerId: 'satellites',
        title: s.name,
        position: { lat: Math.round(p.lat * 1000) / 1000, lon: Math.round(p.lon * 1000) / 1000 },
        geoPrecision: 'exact',
        geoBasis: `SGP4 propagation of CelesTrak elements (sub-satellite point at ${Math.round(p.altKm)} km)`,
        observedAt: now.toISOString(),
        source: { provider: 'celestrak', platform: 'celestrak.org', url: `https://celestrak.org/satcat/table-satcat.php?CATNR=${s.norad}`, retrievedAt: now.toISOString() },
        tags: ['satellite', s.group.toLowerCase()],
        props: {
          kind: 'satellite',
          norad: s.norad,
          intlId: s.intlId,
          group: s.group,
          altitudeKm: Math.round(p.altKm),
          speedKms: Math.round(p.speedKms * 100) / 100,
          inclination: Math.round(s.incl * 10) / 10,
          periodMin: Math.round(s.periodMin),
          orbit: p.altKm > 30000 ? 'GEO' : p.altKm > 2000 ? 'MEO' : 'LEO',
        },
      })
    }
    return out
  },
}
