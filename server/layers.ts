import type { Provider } from './core/provider.ts'
import { seedProvider } from './providers/livestreams/seed.ts'
import { youtubeApiProvider } from './providers/livestreams/youtube-api.ts'
import { eonetProvider } from './providers/osint/eonet.ts'
import { gdacsProvider } from './providers/osint/gdacs.ts'
import { iodaProvider } from './providers/osint/ioda.ts'
import { usgsProvider } from './providers/osint/usgs.ts'
import { gdeltEventsProvider } from './providers/unrest/gdelt.ts'
import { marketsProvider } from './providers/markets/engine.ts'
import { newsProvider } from './providers/news/wire.ts'
import { truthProvider } from './providers/narratives/truth.ts'
import { youtubeScrapeProvider } from './providers/livestreams/youtube-scrape.ts'

/**
 * SERVER LAYER REGISTRY. A layer = an id + the providers that feed it.
 * Add a layer: create `server/providers/<layer>/*.ts`, list them here.
 * Provider order = dedupe priority (earlier wins), so put the best source first.
 */
export const LAYERS: Record<string, Provider[]> = {
  livestreams: [youtubeApiProvider, youtubeScrapeProvider, seedProvider],
  narratives: [truthProvider],
  news: [newsProvider],
  markets: [marketsProvider],
  unrest: [gdeltEventsProvider],
  osint: [iodaProvider, gdacsProvider, usgsProvider, eonetProvider],
}
