import type { Feature } from '../../../shared/feature.ts'

export const LAYER_ID = 'livestreams'

/** "4K watching" / "1,234 watching" / "1.2M watching" -> number */
export function parseViewers(text?: string): number | undefined {
  if (!text) return undefined
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/)
  if (!m) return undefined
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return undefined
  const mult = m[2].toLowerCase() === 'k' ? 1e3 : m[2].toLowerCase() === 'm' ? 1e6 : 1
  return Math.round(n * mult)
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** Deterministic spread so several streams in one city/country don't stack. */
export function jitter(id: string, lat: number, lon: number, degrees: number) {
  const a = hash(id + 'a') * Math.PI * 2
  const r = Math.sqrt(hash(id + 'r')) * degrees
  return {
    lat: Math.max(-89.9, Math.min(89.9, lat + Math.sin(a) * r)),
    lon: lon + (Math.cos(a) * r) / Math.max(0.2, Math.cos((lat * Math.PI) / 180)),
  }
}

export function youtubeFeature(args: {
  provider: string
  videoId: string
  title: string
  position: { lat: number; lon: number }
  geoPrecision: Feature['geoPrecision']
  geoBasis: string
  channel?: string
  viewers?: number
  tags?: string[]
  observedAt?: string
  embedUrl?: string
  url?: string
  extra?: Record<string, unknown>
}): Feature {
  const now = new Date().toISOString()
  return {
    id: `${LAYER_ID}:youtube:${args.videoId}`,
    layerId: LAYER_ID,
    title: args.title,
    position: args.position,
    geoPrecision: args.geoPrecision,
    geoBasis: args.geoBasis,
    observedAt: args.observedAt ?? now,
    source: {
      provider: args.provider,
      platform: 'youtube',
      url: args.url ?? `https://www.youtube.com/watch?v=${args.videoId}`,
      retrievedAt: now,
    },
    media: {
      kind: 'iframe',
      url: args.embedUrl ?? `https://www.youtube.com/embed/${args.videoId}?autoplay=1&mute=1`,
    },
    tags: args.tags ?? [],
    props: { channel: args.channel, viewers: args.viewers, live: true, ...args.extra },
  }
}
