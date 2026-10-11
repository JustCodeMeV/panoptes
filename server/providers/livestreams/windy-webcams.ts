import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { embedFeature, LAYER_ID } from './util.ts'

/**
 * PUBLIC WEBCAMS (Windy Webcams API v3). Cameras whose operators opt in to public redistribution:
 * live or near-live views of public places, with coordinates, for corroborating what is happening
 * on the ground. This is the consented, published-for-viewing counterpart to exposed private cameras
 * (which ARGUS does not touch): every item here is a feed its operator chose to make public.
 *
 * Only the credit-free aggregate list is used, over a few regional boxes, capped and cached. The
 * embed URL is Windy's own player; tokens on image URLs expire, so we embed the player, not frames.
 */

type Webcam = {
  webcamId: number
  title: string
  status?: string
  location?: { latitude?: number; longitude?: number; city?: string; country?: string }
  player?: { live?: { embed?: string; available?: boolean }; day?: { embed?: string } }
}
type ListResponse = { total?: number; webcams?: Webcam[] }

// Continent-scale boxes [north, south, west, east]; v3 caps a list at 50, so query a few and merge
const BOXES: [number, number, number, number][] = [
  [71, 35, -11, 40], // Europe
  [49, 24, -125, -66], // North America
  [37, -35, -18, 52], // Africa + Middle East
  [55, 5, 60, 150], // Asia
  [-10, -55, 110, 180], // Oceania
  [13, -56, -82, -34], // South America
]
const PER_BOX = 24
const MAX = 120

export const windyWebcamsProvider: Provider = {
  id: 'windy-webcams',
  layerId: LAYER_ID,
  requires: ['WINDY_WEBCAMS_KEY'],
  ttlMs: 30 * 60_000,
  async fetch({ signal }) {
    const key = process.env.WINDY_WEBCAMS_KEY
    if (!key) return []
    const seen = new Set<number>()
    const out: Feature[] = []
    for (const [n, s, w, e] of BOXES) {
      if (out.length >= MAX) break
      const url = `https://api.windy.com/webcams/api/v3/webcams?include=location,player&limit=${PER_BOX}&nelat=${n}&nelng=${e}&swlat=${s}&swlng=${w}`
      const r = await fetch(url, { headers: { 'x-windy-api-key': key, accept: 'application/json' }, signal }).catch(() => null)
      if (!r?.ok) {
        if (r) console.warn(`[windy] HTTP ${r.status}`)
        continue
      }
      const list = (await r.json().catch(() => null)) as ListResponse | null
      for (const cam of list?.webcams ?? []) {
        const lat = cam.location?.latitude
        const lon = cam.location?.longitude
        const embed = cam.player?.live?.embed ?? cam.player?.day?.embed
        if (seen.has(cam.webcamId) || typeof lat !== 'number' || typeof lon !== 'number' || !embed) continue
        seen.add(cam.webcamId)
        const place = [cam.location?.city, cam.location?.country].filter(Boolean).join(', ')
        out.push(
          embedFeature({
            provider: 'windy-webcams',
            platform: 'Windy Webcams',
            id: String(cam.webcamId),
            title: cam.title || place || `Webcam ${cam.webcamId}`,
            position: { lat, lon },
            geoBasis: place ? `public webcam at ${place}` : 'public webcam location',
            embedUrl: embed,
            url: `https://www.windy.com/webcams/${cam.webcamId}`,
            tags: cam.player?.live?.embed ? ['live'] : ['timelapse'],
            extra: { place: place || undefined, live: !!cam.player?.live?.embed },
          }),
        )
        if (out.length >= MAX) break
      }
    }
    return out
  },
}
