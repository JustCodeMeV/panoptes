import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { fetchText } from '../osint/util.ts'

export const LAYER_ID = 'military-air'

type Ac = { hex: string; flight?: string; r?: string; t?: string; desc?: string; alt_baro?: number | 'ground'; gs?: number; track?: number; lat?: number; lon?: number; squawk?: string; emergency?: string; seen_pos?: number; ownOp?: string }

/**
 * adsb.lol: community ADS-B network, unfiltered. `/v2/mil` = aircraft flagged
 * military in the database. Only aircraft broadcasting a position appear:
 * many military flights fly dark, so absence means nothing.
 */
export const adsblolProvider: Provider = {
  id: 'adsb-lol',
  layerId: LAYER_ID,
  async fetch() {
    const d = JSON.parse(await fetchText('https://api.adsb.lol/v2/mil', 20_000)) as { ac?: Ac[]; now?: number }
    return (d.ac ?? []).map(toFeature).filter((f): f is Feature => !!f)
  },
}

export function toFeature(a: Ac): Feature | null {
  if (a.lat === undefined || a.lon === undefined || (a.seen_pos ?? 0) > 120) return null
  const now = new Date().toISOString()
  const call = a.flight?.trim()
  const alt = a.alt_baro === 'ground' ? 'on ground' : a.alt_baro !== undefined ? `${Math.round(a.alt_baro).toLocaleString()} ft` : undefined
  const squawk = a.squawk && ['7500', '7600', '7700'].includes(a.squawk) ? a.squawk : undefined
  return {
    id: `${LAYER_ID}:adsb:${a.hex}`,
    layerId: LAYER_ID,
    title: `${call || a.r || a.hex.toUpperCase()}${a.t ? ` · ${a.t}` : ''}`,
    position: { lat: a.lat, lon: a.lon },
    geoPrecision: 'exact',
    geoBasis: 'aircraft-reported position (ADS-B)',
    observedAt: now,
    source: { provider: 'adsb-lol', platform: 'adsb.lol', url: `https://globe.adsb.lol/?icao=${a.hex}`, retrievedAt: now },
    tags: ['military', 'aircraft', ...(squawk ? ['emergency'] : [])],
    props: { kind: 'aircraft', hex: a.hex, callsign: call, registration: a.r, type: a.t, desc: a.desc, operator: a.ownOp, altitude: alt, speedKt: a.gs, track: a.track, squawk, emergency: a.emergency !== 'none' ? a.emergency : undefined },
  }
}
