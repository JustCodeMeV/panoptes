import { Innertube } from 'youtubei.js'
import { geolocate } from '../../geo/gazetteer.ts'
import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, parseViewers, youtubeFeature } from './util.ts'

// Unrest-oriented queries. Add more here; each is one scrape call per refresh.
const QUERIES = [
  'live protest',
  'live riot',
  'live demonstration',
  'live clashes',
  'live rally march',
  'breaking news live unrest',
]

// Search is fuzzy; drop obvious non-unrest streams (games, sport, music, betting).
const NOISE =
  /\b(valorant|gameplay|gaming|minecraft|fortnite|gta|roblox|pubg|free fire|esports?|ranked|facecam|football|soccer|cricket|nations league|vs\.?|match|ipl|nba|nfl|olympics?|asian games|concert|music|lofi|radio|podcast|casino|slots|betting|astrology|horoscope)\b|#shorts?live/i

let client: Promise<Innertube> | undefined
const yt = () => (client ??= Innertube.create({ retrieve_player: false }))

/**
 * Key-less provider: scrapes YouTube search (Innertube) filtered to LIVE.
 * Search results carry no coordinates, so position is INFERRED from the
 * title/channel text via the gazetteer and labelled `inferred`. Streams whose
 * text names no known place are dropped rather than guessed.
 */
export const youtubeScrapeProvider: Provider = {
  id: 'youtube-scrape',
  layerId: LAYER_ID,
  async fetch({ signal }) {
    const tube = await yt()
    const settled = await Promise.allSettled(
      QUERIES.map((q) => tube.search(q, { type: 'video', features: ['live'] })),
    )
    if (signal.aborted) throw new Error('aborted')
    if (settled.every((s) => s.status === 'rejected')) {
      throw new Error(String((settled[0] as PromiseRejectedResult).reason))
    }

    const out = new Map<string, ReturnType<typeof youtubeFeature>>()
    settled.forEach((res, i) => {
      if (res.status !== 'fulfilled') return
      for (const v of res.value.results ?? []) {
        if (v.type !== 'Video') continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const video = v as any
        if (!video.is_live || !video.video_id || out.has(video.video_id)) continue
        const title: string = video.title?.text ?? ''
        const channel: string | undefined = video.author?.name
        if (NOISE.test(title)) continue
        const hit = geolocate(title, channel)
        if (!hit) continue
        out.set(
          video.video_id,
          youtubeFeature({
            provider: 'youtube-scrape',
            videoId: video.video_id,
            title,
            position: { lat: hit.lat, lon: hit.lon },
            geoPrecision: 'inferred',
            geoBasis: `matched "${hit.name}" in title/channel (${hit.kind})`,
            channel,
            viewers: parseViewers(video.short_view_count?.text ?? video.view_count?.text),
            tags: ['unrest', QUERIES[i].replace(/^(breaking news )?live /, '')],
          }),
        )
      }
    })
    return [...out.values()]
  },
}
