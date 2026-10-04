import type { Provider } from '../../core/provider.ts'
import { direct, pollAll, publicationFeature, sites } from './common.ts'

/** Official statements by governments of every bloc and by intergovernmental bodies. */
const FEEDS = [
  direct('st-state', 'https://www.state.gov/rss-feed/press-releases/feed/', 'state.gov'),
  direct('st-dod', 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945&max=10', 'defense.gov'),
  direct('st-kremlin', 'http://en.kremlin.ru/events/president/news/feed', 'kremlin.ru'),
  direct('st-fcdo', 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=foreign-commonwealth-development-office', 'gov.uk'),
  direct('st-ukmod', 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=ministry-of-defence', 'gov.uk'),
  direct('st-council', 'https://www.consilium.europa.eu/en/rss/pressreleases.ashx', 'consilium.europa.eu'),
  direct('st-un', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', 'news.un.org'),
  // No usable RSS: grouped Google News searches over the ministries' own sites
  sites('st-a', ['mid.ru', 'mfa.gov.ua', 'president.gov.ua', 'mea.gov.in', 'mfa.gov.tr', 'en.mfa.ir', 'diplomatie.gouv.fr']),
  sites('st-cn', ['fmprc.gov.cn', 'mfa.gov.cn', 'mod.gov.cn', 'english.www.gov.cn'], '7d'),
  sites('st-b', ['gov.il', 'mofa.gov.sa', 'mofa.gov.ae', 'mofa.go.jp', 'mofa.go.kr', 'auswaertiges-amt.de', 'eeas.europa.eu', 'nato.int']),
  sites('st-c', ['dirco.gov.za', 'cancilleria.gob.mx', 'mofa.gov.pk', 'mil.ru', 'whitehouse.gov'], '7d'),
]

export const statementsProvider: Provider = {
  id: 'statements',
  layerId: 'statements',
  ttlMs: 15 * 60_000,
  async fetch() {
    const items = await pollAll(FEEDS, 10)
    return items.map((it) => publicationFeature('statements', 'statement', it, 4 * 86_400_000)).filter((f) => f !== null)
  },
}
