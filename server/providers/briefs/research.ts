import type { Provider } from '../../core/provider.ts'
import { direct, pollAll, publicationFeature, sites } from './common.ts'

/** Analyses by think tanks and research groups of every bloc (ownership in server/truth/issuers.ts). */
const FEEDS = [
  direct('rs-crisisgroup', 'https://www.crisisgroup.org/rss.xml', 'crisisgroup.org'),
  direct('rs-bellingcat', 'https://www.bellingcat.com/feed/', 'bellingcat.com'),
  direct('rs-ajcs', 'https://studies.aljazeera.net/en/rss.xml', 'studies.aljazeera.net'),
  direct('rs-wotr', 'https://warontherocks.com/feed/', 'warontherocks.com'),
  sites('rs-a', ['understandingwar.org', 'csis.org', 'rusi.org', 'carnegieendowment.org', 'chathamhouse.org'], '7d'),
  sites('rs-b', ['valdaiclub.com', 'russiancouncil.ru', 'ciis.org.cn', 'cicir.ac.cn', 'orfonline.org', 'idsa.in', 'setav.org', 'issafrica.org'], '7d'),
  sites('rs-c', ['iiss.org', 'sipri.org', 'ecfr.eu', 'merics.org', 'rand.org', 'brookings.edu', 'cfr.org'], '7d'),
]

export const researchProvider: Provider = {
  id: 'research',
  layerId: 'research',
  ttlMs: 30 * 60_000,
  async fetch() {
    const items = await pollAll(FEEDS, 8)
    return items.map((it) => publicationFeature('research', 'analysis', it, 10 * 86_400_000)).filter((f) => f !== null)
  },
}
