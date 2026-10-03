import type { Feature } from '../../../shared/feature.ts'

export const LAYER_ID = 'osint'
export type Severity = 'low' | 'medium' | 'high'

export type OsintProps = {
  kind: 'osint'
  category: string
  severity: Severity
  summary?: string
  magnitude?: string
  feed: string
}

export function osintFeature(a: {
  provider: string
  feed: string
  externalId: string
  title: string
  category: string
  severity: Severity
  summary?: string
  magnitude?: string
  lat?: number
  lon?: number
  precision: Feature['geoPrecision']
  basis: string
  url?: string
  at?: string
}): Feature {
  const now = new Date().toISOString()
  const props: OsintProps = { kind: 'osint', category: a.category, severity: a.severity, summary: a.summary, magnitude: a.magnitude, feed: a.feed }
  return {
    id: `${LAYER_ID}:${a.provider}:${a.externalId}`,
    layerId: LAYER_ID,
    title: a.title,
    position: a.lat !== undefined && a.lon !== undefined ? { lat: a.lat, lon: a.lon } : undefined,
    geoPrecision: a.lat === undefined ? 'none' : a.precision,
    geoBasis: a.basis,
    observedAt: a.at ?? now,
    source: { provider: a.provider, platform: a.feed, url: a.url, retrievedAt: now },
    tags: [a.category, a.severity],
    props: props as unknown as Record<string, unknown>,
  }
}

export async function fetchText(url: string, ms = 20_000): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 panoptes-research/0.1' }, signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).host}`)
  return res.text()
}
