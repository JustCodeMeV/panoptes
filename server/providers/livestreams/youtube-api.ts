import type { Provider } from '../../core/provider.ts'
import { TtlCache } from '../../core/cache.ts'
import type { Feature } from '../../../shared/feature.ts'
import { LAYER_ID, youtubeFeature } from './util.ts'

const KEY = () => process.env.YOUTUBE_API_KEY

// Sweep centres (<=1000 km radius each). search.list costs 100 quota units per
// call, so keep this short and the cache long.
const SWEEP: [name: string, lat: number, lon: number][] = [
  ['Eastern Europe', 49, 31],
  ['Levant', 32, 36],
  ['Gulf/Iran', 30, 50],
  ['South Asia', 25, 78],
  ['West Europe', 49, 3],
  ['US East', 39, -77],
  ['US West', 36, -119],
  ['Latin America N', 10, -75],
  ['East Africa', 5, 38],
  ['SE Asia', 14, 105],
]

const cache = new TtlCache<Feature[]>(15 * 60_000)

type SearchItem = { id: { videoId: string } }
type VideoItem = {
  id: string
  snippet: { title: string; channelTitle: string; publishedAt: string }
  recordingDetails?: { location?: { latitude: number; longitude: number } }
  liveStreamingDetails?: { concurrentViewers?: string; actualStartTime?: string }
  status?: { embeddable?: boolean }
}

async function api<T>(path: string, params: Record<string, string>, signal: AbortSignal): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
  for (const [k, v] of Object.entries({ ...params, key: KEY()! })) url.searchParams.set(k, v)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`YouTube API ${path} ${res.status}`)
  return (await res.json()) as T
}

/**
 * Official API provider, enabled only when YOUTUBE_API_KEY is set. Uses true
 * geo search (`location` + `locationRadius`), so positions are uploader-reported
 * and kept at full precision (`exact`). Only streams that carry recordingDetails.location are kept.
 */
export const youtubeApiProvider: Provider = {
  id: 'youtube-api',
  layerId: LAYER_ID,
  enabled: () => Boolean(KEY()),
  fetch({ signal }) {
    return cache.get('sweep', async () => {
      const ids = new Set<string>()
      const found = await Promise.allSettled(
        SWEEP.map(([, lat, lon]) =>
          api<{ items: SearchItem[] }>(
            'search',
            {
              part: 'snippet',
              type: 'video',
              eventType: 'live',
              location: `${lat},${lon}`,
              locationRadius: '1000km',
              maxResults: '25',
              order: 'viewCount',
            },
            signal,
          ),
        ),
      )
      for (const r of found) if (r.status === 'fulfilled') r.value.items.forEach((i) => ids.add(i.id.videoId))
      if (!ids.size) return []

      const list = [...ids]
      const features: Feature[] = []
      for (let i = 0; i < list.length; i += 50) {
        const { items } = await api<{ items: VideoItem[] }>(
          'videos',
          {
            part: 'snippet,recordingDetails,liveStreamingDetails,status',
            id: list.slice(i, i + 50).join(','),
          },
          signal,
        )
        for (const v of items) {
          const loc = v.recordingDetails?.location
          if (!loc || v.status?.embeddable === false) continue
          features.push(
            youtubeFeature({
              provider: 'youtube-api',
              videoId: v.id,
              title: v.snippet.title,
              position: { lat: loc.latitude, lon: loc.longitude },
              geoPrecision: 'exact',
              geoBasis: 'uploader-reported recordingDetails.location',
              channel: v.snippet.channelTitle,
              viewers: Number(v.liveStreamingDetails?.concurrentViewers) || undefined,
              observedAt: v.liveStreamingDetails?.actualStartTime ?? v.snippet.publishedAt,
              tags: ['geo-tagged'],
            }),
          )
        }
      }
      return features
    })
  },
}
