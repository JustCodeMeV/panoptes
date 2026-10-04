import type { Provider } from './core/provider.ts'
import { seedProvider } from './providers/livestreams/seed.ts'
import { youtubeApiProvider } from './providers/livestreams/youtube-api.ts'
import { eonetProvider } from './providers/osint/eonet.ts'
import { gdacsProvider } from './providers/osint/gdacs.ts'
import { iodaProvider } from './providers/osint/ioda.ts'
import { usgsProvider } from './providers/osint/usgs.ts'
import { gdeltEventsProvider } from './providers/unrest/gdelt.ts'
import { marketsProvider } from './providers/markets/engine.ts'
import { campaignsProvider } from './providers/news/campaigns.ts'
import { newsProvider } from './providers/news/wire.ts'
import { truthProvider } from './providers/narratives/truth.ts'
import { youtubeScrapeProvider } from './providers/livestreams/youtube-scrape.ts'
import { ooniProvider } from './providers/osint/ooni.ts'
import { gpsjamProvider } from './providers/gnss/gpsjam.ts'
import { adsblolProvider } from './providers/military/adsblol.ts'
import { deepstateProvider } from './providers/frontlines/deepstate.ts'
import { grokProvider } from './providers/x/grok.ts'
import { cablesProvider } from './providers/infrastructure/cables.ts'
import { acledProvider } from './providers/acled/acled.ts'
import { firmsProvider } from './providers/osint/firms.ts'
import { cloudflareProvider } from './providers/osint/cloudflare.ts'
import { telegramProvider } from './providers/telegram/scouts.ts'
import { ciiProvider } from './providers/cii/index.ts'
import { googleTrendsProvider } from './providers/trends/google.ts'
import { wikiCurrentProvider } from './providers/conflict/wikicurrent.ts'
import { celestrakProvider } from './providers/space/celestrak.ts'
import { aisstreamProvider } from './providers/maritime/aisstream.ts'
import { eventsProvider } from './providers/events/entities.ts'
import { financeProvider } from './providers/finance/yahoo.ts'

/**
 * SERVER LAYER REGISTRY. A layer = an id + the providers that feed it.
 * Add a layer: create `server/providers/<layer>/*.ts`, list them here.
 * Provider order = dedupe priority (earlier wins), so put the best source first.
 */
export const LAYERS: Record<string, Provider[]> = {
  livestreams: [youtubeApiProvider, youtubeScrapeProvider, seedProvider],
  narratives: [truthProvider],
  events: [eventsProvider],
  atlas: [], // client-only: country outlines opened by clicking the globe
  news: [newsProvider],
  telegram: [telegramProvider],
  campaigns: [campaignsProvider],
  markets: [marketsProvider],
  finance: [financeProvider],
  cii: [ciiProvider],
  trends: [googleTrendsProvider],
  unrest: [gdeltEventsProvider],
  osint: [iodaProvider, cloudflareProvider, ooniProvider, gdacsProvider, usgsProvider, eonetProvider, firmsProvider],
  gnss: [gpsjamProvider],
  'military-air': [adsblolProvider],
  frontlines: [deepstateProvider],
  acled: [acledProvider, wikiCurrentProvider],
  infrastructure: [cablesProvider],
  satellites: [celestrakProvider],
  ships: [aisstreamProvider],
  x: [grokProvider],
}
