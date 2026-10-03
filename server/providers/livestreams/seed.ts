import { readFileSync } from 'node:fs'
import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, youtubeFeature } from './util.ts'

type Seed = {
  externalId: string
  channelId: string
  title: string
  channel: string
  location: string
  lat: number
  lon: number
  tags?: string[]
}

const seeds: Seed[] = JSON.parse(
  readFileSync(new URL('../../data/seed-streams.json', import.meta.url), 'utf8'),
)

/**
 * Curated always-on channels. Demo safety net: the globe is never empty, and it
 * needs no scraping or key. Position = broadcaster base (approximate), and the
 * embed uses YouTube's "channel live_stream" URL so it follows the current live.
 */
export const seedProvider: Provider = {
  id: 'seed',
  layerId: LAYER_ID,
  async fetch() {
    return seeds.map((s) =>
      youtubeFeature({
        provider: 'seed',
        videoId: `ch-${s.externalId}`,
        title: s.title,
        position: { lat: s.lat, lon: s.lon },
        geoPrecision: 'approximate',
        geoBasis: `broadcaster base: ${s.location}`,
        channel: s.channel,
        tags: s.tags,
        embedUrl: `https://www.youtube.com/embed/live_stream?channel=${s.channelId}&autoplay=1&mute=1`,
        url: `https://www.youtube.com/channel/${s.channelId}/live`,
        extra: { curated: true },
      }),
    )
  },
}
