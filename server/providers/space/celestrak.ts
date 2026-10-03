import { degreesLat, degreesLong, eciToGeodetic, gstime, json2satrec, propagate, type OMMJsonObject, type SatRec } from 'satellite.js'
import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import snapshot from './elements-snapshot.json' with { type: 'json' }

/**
 * Satellites overhead right now: military, reconnaissance/radar, Earth
 * observation, navigation and crewed stations. Orbital elements come from
 * CelesTrak (keyless, refreshed every 6 h); positions are propagated with
 * SGP4 on every request, so pins move as the layer refreshes.
 * CelesTrak drops connections from some shared cloud IPs; then a bundled
 * element snapshot is used (accurate to a few km for days in LEO) and the
 * position basis says so.
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
let elementsFrom = 'CelesTrak (live)'

type Omm = OMMJsonObject & { MEAN_MOTION: number; INCLINATION: number }

async function loadElements(signal: AbortSignal) {
  let lists: { g: (typeof GROUPS)[number]; list: Omm[] }[]
  try {
    lists = await Promise.all(
      GROUPS.map(async (g) => {
        const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g.id}&FORMAT=json`, { headers: { 'user-agent': 'panoptes-research/0.1' }, signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) })
        if (!res.ok) throw new Error(`HTTP ${res.status} celestrak.org`)
        return { g, list: (await res.json()) as Omm[] }
      }),
    )
    elementsFrom = 'CelesTrak (live)'
  } catch (e) {
    if (sats.length) throw e // keep the elements we have; aggregate marks the source stale
    lists = GROUPS.map((g) => ({ g, list: (snapshot.groups as unknown as Record<string, Omm[]>)[g.id] ?? [] }))
    elementsFrom = `bundled CelesTrak snapshot of ${snapshot.fetchedAt.slice(0, 10)}`
    console.warn(`[celestrak] live elements unavailable (${e instanceof Error ? e.message : String(e)}); using ${elementsFrom}`)
  }
  const out: Sat[] = []
  const seen = new Set<number>()
  for (const { g, list } of lists) {
    for (const o of list) {
      if (seen.has(Number(o.NORAD_CAT_ID))) continue
      seen.add(Number(o.NORAD_CAT_ID))
      out.push({ name: o.OBJECT_NAME, norad: Number(o.NORAD_CAT_ID), group: g.label, intlId: o.OBJECT_ID, rec: json2satrec(o), incl: Number(o.INCLINATION), periodMin: 1440 / Number(o.MEAN_MOTION) })
    }
  }
  sats = out
  // On the snapshot, try the live source again in 30 min rather than 6 h.
  loadedAt = elementsFrom.startsWith('bundled') ? Date.now() - ELEMENTS_TTL + 30 * 60_000 : Date.now()
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
        geoBasis: `SGP4 propagation of ${elementsFrom} elements (sub-satellite point at ${Math.round(p.altKm)} km)`,
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
