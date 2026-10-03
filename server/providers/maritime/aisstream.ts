import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { redact } from '../../core/secrets.ts'

/**
 * Ships at the world's chokepoints, live from AISStream (free key,
 * AISSTREAM_API_KEY). One WebSocket subscribed to bounding boxes around
 * Hormuz, Bab el-Mandeb, Suez, the Bosporus, Kerch, the Taiwan Strait and the
 * Gulf of Finland; the last position per vessel is kept for 30 min. A vessel
 * that stops reporting inside a box is flagged "went dark" (AIS off, or out
 * of receiver range: a lead, not proof).
 */

const BOXES: { name: string; box: [[number, number], [number, number]] }[] = [
  { name: 'Strait of Hormuz', box: [[24.5, 54.5], [27.5, 58.0]] },
  { name: 'Bab el-Mandeb', box: [[11.5, 42.5], [14.0, 44.5]] },
  { name: 'Suez Canal', box: [[29.5, 32.0], [31.5, 33.0]] },
  { name: 'Bosporus', box: [[40.8, 28.8], [41.4, 29.3]] },
  { name: 'Kerch Strait', box: [[44.8, 35.9], [45.6, 37.2]] },
  { name: 'Taiwan Strait', box: [[22.0, 117.5], [26.0, 121.0]] },
  { name: 'Gulf of Finland', box: [[59.0, 22.0], [60.6, 30.5]] },
]
const KEEP_MS = 30 * 60_000
const DARK_MS = 20 * 60_000

type Ship = { mmsi: number; name?: string; lat: number; lon: number; sog?: number; cog?: number; heading?: number; type?: number; dest?: string; at: number; zone: string }
const ships = new Map<number, Ship>()
let ws: WebSocket | undefined
let lastError: string | undefined
let reconnectAt = 0

const zoneOf = (lat: number, lon: number) => BOXES.find(({ box: [[s, w], [n, e]] }) => lat >= s && lat <= n && lon >= w && lon <= e)?.name

function connect() {
  const key = process.env.AISSTREAM_API_KEY
  if (!key || ws || Date.now() < reconnectAt) return
  const sock = new WebSocket('wss://stream.aisstream.io/v0/stream')
  ws = sock
  sock.onopen = () => {
    sock.send(JSON.stringify({ APIKey: key, BoundingBoxes: BOXES.map((b) => b.box), FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }))
    lastError = undefined
  }
  sock.onmessage = (ev) => {
    try {
      const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data as ArrayBuffer).toString()) as {
        MessageType?: string
        error?: string
        MetaData?: { MMSI: number; ShipName?: string; latitude: number; longitude: number }
        Message?: { PositionReport?: { Sog?: number; Cog?: number; TrueHeading?: number }; ShipStaticData?: { Type?: number; Destination?: string; Name?: string } }
      }
      if (m.error) {
        lastError = redact(String(m.error))
        return
      }
      const md = m.MetaData
      if (!md) return
      const zone = zoneOf(md.latitude, md.longitude)
      const prev = ships.get(md.MMSI)
      if (!zone && !prev) return
      const s: Ship = prev ?? { mmsi: md.MMSI, lat: md.latitude, lon: md.longitude, at: Date.now(), zone: zone ?? '' }
      if (m.MessageType === 'PositionReport') {
        const p = m.Message?.PositionReport
        Object.assign(s, { lat: md.latitude, lon: md.longitude, sog: p?.Sog, cog: p?.Cog, heading: p?.TrueHeading !== 511 ? p?.TrueHeading : undefined, at: Date.now(), zone: zone ?? s.zone })
      } else if (m.MessageType === 'ShipStaticData') {
        const d = m.Message?.ShipStaticData
        Object.assign(s, { type: d?.Type, dest: d?.Destination?.trim() || undefined })
      }
      s.name = md.ShipName?.trim() || s.name
      ships.set(md.MMSI, s)
    } catch {
      // ignore malformed frames
    }
  }
  sock.onerror = () => {
    lastError = 'AISStream connection error'
  }
  sock.onclose = () => {
    ws = undefined
    reconnectAt = Date.now() + 30_000
  }
}

// AIS ship type codes (ITU-R M.1371): the tens digit is the category.
const TYPE: Record<number, string> = { 3: 'special craft', 5: 'special craft', 6: 'passenger', 7: 'cargo', 8: 'tanker', 9: 'other' }
const typeName = (t?: number) => (t === 35 ? 'military' : t === 30 ? 'fishing' : t ? (TYPE[Math.floor(t / 10)] ?? 'other') : undefined)

export const aisstreamProvider: Provider = {
  id: 'aisstream',
  layerId: 'ships',
  ttlMs: 15_000,
  requires: ['AISSTREAM_API_KEY'],
  async fetch() {
    connect()
    if (lastError && !ships.size) throw new Error(lastError)
    const now = Date.now()
    const out: Feature[] = []
    for (const s of ships.values()) {
      if (now - s.at > KEEP_MS) {
        ships.delete(s.mmsi)
        continue
      }
      const dark = now - s.at > DARK_MS
      const kind = typeName(s.type)
      out.push({
        id: `ships:${s.mmsi}`,
        layerId: 'ships',
        title: s.name || `MMSI ${s.mmsi}`,
        position: { lat: s.lat, lon: s.lon },
        geoPrecision: 'exact',
        geoBasis: `AIS position report (${s.zone})`,
        observedAt: new Date(s.at).toISOString(),
        source: { provider: 'aisstream', platform: 'AIS', url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${s.mmsi}`, retrievedAt: new Date().toISOString() },
        tags: ['ship', ...(kind ? [kind] : []), ...(dark ? ['dark'] : [])],
        props: { kind: 'ship', mmsi: s.mmsi, shipType: kind, zone: s.zone, speedKn: s.sog, course: s.cog, heading: s.heading, destination: s.dest, dark, lastSeenMin: Math.round((now - s.at) / 60_000) },
      })
    }
    return out
  },
}
