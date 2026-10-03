import type { Provider } from '../../core/provider.ts'
import { geolocate } from '../../geo/gazetteer.ts'
import { LAYER_ID, osintFeature } from './util.ts'

type Annotation = {
  id: string
  description?: string
  startDate: string
  endDate?: string | null
  eventType?: string
  linkedUrl?: string
  scope?: string
  locations?: string[]
  locationsDetails?: { code: string; name: string }[]
  outage?: { outageCause?: string; outageType?: string }
}

/**
 * Cloudflare Radar outage annotations: curated internet disruptions with a
 * stated cause (government shutdown, cable cut, power, military action).
 * Complements IODA's automatic detection. Needs CLOUDFLARE_RADAR_TOKEN.
 */
export const cloudflareProvider: Provider = {
  id: 'cloudflare-radar',
  layerId: LAYER_ID,
  async fetch() {
    const token = process.env.CLOUDFLARE_RADAR_TOKEN
    if (!token) throw new Error('no CLOUDFLARE_RADAR_TOKEN')
    const res = await fetch('https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=7d&limit=100&format=json', {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`Cloudflare Radar HTTP ${res.status}`)
    const d = (await res.json()) as { result?: { annotations?: Annotation[] } }
    const out = []
    for (const a of d.result?.annotations ?? []) {
      const ongoing = !a.endDate
      for (const loc of a.locationsDetails ?? (a.locations ?? []).map((code) => ({ code, name: code }))) {
        const hit = geolocate(a.scope && a.scope !== loc.name ? `${a.scope} ${loc.name}` : loc.name) ?? geolocate(loc.name)
        if (!hit) continue
        const cause = a.outage?.outageCause?.replace(/_/g, ' ')
        out.push(
          osintFeature({
            provider: 'cloudflare-radar',
            feed: 'Cloudflare Radar',
            externalId: `${a.id}:${loc.code}`,
            title: `Internet outage: ${a.scope && a.scope !== loc.name ? `${a.scope}, ` : ''}${loc.name}${ongoing ? ' (ongoing)' : ''}`,
            category: 'internet outage',
            severity: /government|military|war/i.test(cause ?? '') || ongoing ? 'high' : 'medium',
            magnitude: cause ? `cause: ${cause}` : undefined,
            summary: a.description ?? undefined,
            lat: hit.lat,
            lon: hit.lon,
            precision: 'inferred',
            basis: `outage scope "${a.scope ?? loc.name}", shown at ${hit.name} (${hit.kind})`,
            url: a.linkedUrl ?? `https://radar.cloudflare.com/outage-center`,
            at: a.startDate,
          }),
        )
      }
    }
    return out
  },
}
