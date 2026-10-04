import type { Precision } from '../../shared/entities.ts'
import { scoreLocations } from '../geo/gazetteer.ts'

/**
 * Place name -> coordinates. The offline gazetteer first; anything more
 * precise (a village, a district, a base) goes to OpenStreetMap's Nominatim,
 * one request per second, cached, per its usage policy.
 */

type Hit = { name: string; lat: number; lon: number; precision: Precision; country?: string; via: 'gazetteer' | 'osm' }
const cache = new Map<string, Hit | null>()
let last = 0

export async function geocode(name: string, admin: string | undefined, country: string | undefined, precision: Precision): Promise<Hit | null> {
  const key = [name, admin, country].filter(Boolean).join(', ')
  if (cache.has(key)) return cache.get(key)!
  // The gazetteer knows countries, capitals and frequent flashpoints exactly.
  const g = scoreLocations([{ text: name, weight: 3 }, { text: [admin, country].filter(Boolean).join(' '), weight: 1 }])
  // Use it when it names this very place, or when only the country was asked for; anything finer goes to OSM.
  if (g && (g.name.toLowerCase() === name.toLowerCase() || (precision === 'country' && g.kind === 'country'))) {
    const hit: Hit = { name: g.name, lat: g.lat, lon: g.lon, precision: g.kind === 'country' ? 'country' : precision === 'exact' ? 'town' : precision, country: g.country, via: 'gazetteer' }
    cache.set(key, hit)
    return hit
  }
  const wait = last + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  last = Date.now()
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en&q=${encodeURIComponent(key)}`, {
      headers: { 'user-agent': 'panoptes-research/0.1 (OSINT hackathon demo; https://panoptes-fxcj.onrender.com)' },
      signal: AbortSignal.timeout(10_000),
    })
    const j = res.ok ? ((await res.json()) as { lat: string; lon: string; display_name: string }[]) : []
    const hit: Hit | null = j[0] ? { name, lat: Number(j[0].lat), lon: Number(j[0].lon), precision, country, via: 'osm' } : g ? { name: g.name, lat: g.lat, lon: g.lon, precision: g.kind === 'country' ? 'country' : 'town', country: g.country, via: 'gazetteer' } : null
    cache.set(key, hit)
    return hit
  } catch {
    return null
  }
}
