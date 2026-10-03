/**
 * Live news sources, polled continuously. Add a feed = add a row.
 * `domain` is the fallback outlet domain (aggregators like Google News carry
 * the real outlet per item). Outlet class (established / state) comes from
 * server/truth/domains.ts, not from here.
 */
export type NewsFeed = {
  id: string
  url: string
  domain: string
  everyMs?: number
  /** rss (default) | bluesky search */
  kind?: 'rss' | 'bluesky'
}

const bsky = (id: string, q: string): NewsFeed => ({
  id: `bsky:${id}`,
  kind: 'bluesky',
  domain: 'bsky.app',
  everyMs: 60_000,
  url: `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=latest&limit=40`,
})

const gnews = (id: string, q: string): NewsFeed => ({
  id: `gnews:${id}`,
  domain: 'news.google.com',
  everyMs: 40_000,
  url: `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:2h')}&hl=en-US&gl=US&ceid=US:en`,
})

export const NEWS_FEEDS: NewsFeed[] = [
  { id: 'bbc', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', domain: 'bbc.co.uk' },
  { id: 'aljazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', domain: 'aljazeera.com' },
  { id: 'dw', url: 'https://rss.dw.com/rdf/rss-en-all', domain: 'dw.com' },
  { id: 'france24', url: 'https://www.france24.com/en/rss', domain: 'france24.com' },
  { id: 'guardian', url: 'https://www.theguardian.com/world/rss', domain: 'theguardian.com' },
  { id: 'euronews', url: 'https://www.euronews.com/rss?level=theme&name=news', domain: 'euronews.com' },
  { id: 'sky', url: 'https://feeds.skynews.com/feeds/rss/world.xml', domain: 'news.sky.com' },
  { id: 'npr', url: 'https://feeds.npr.org/1004/rss.xml', domain: 'npr.org' },
  { id: 'scmp', url: 'https://www.scmp.com/rss/91/feed', domain: 'scmp.com' },
  { id: 'ukrinform', url: 'https://www.ukrinform.net/rss/block-lastnews', domain: 'ukrinform.net' },
  { id: 'defensenews', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml', domain: 'defensenews.com' },
  { id: 'bellingcat', url: 'https://www.bellingcat.com/feed/', domain: 'bellingcat.com' },
  { id: 'twz', url: 'https://www.twz.com/feed', domain: 'twz.com' },
  // state-affiliated: useful precisely because they are a different information stream
  { id: 'tass', url: 'https://tass.com/rss/v2.xml', domain: 'tass.com' },
  { id: 'rt', url: 'https://www.rt.com/rss/news/', domain: 'rt.com' },
  { id: 'presstv', url: 'https://www.presstv.ir/rss.xml', domain: 'presstv.ir' },
  { id: 'almanar', url: 'https://english.almanar.com.lb/rss', domain: 'almanar.com.lb' },
  { id: 'cgtn', url: 'https://www.cgtn.com/subscribe/rss/section/world.xml', domain: 'cgtn.com' },
  gnews('unrest', 'protest OR riot OR clashes OR unrest OR crackdown'),
  gnews('strikes', 'missile OR airstrike OR "drone attack" OR shelling OR explosion'),
  gnews('security', 'ceasefire OR hostage OR troops OR "military buildup" OR sanctions'),
  gnews('info', 'disinformation OR deepfake OR hoax OR "fake video" OR propaganda'),
  // social: Bluesky keyword search (Telegram channels are read by the scouts in server/telegram/)
  bsky('unrest', 'protest clashes'),
  bsky('strikes', 'airstrike missile drone'),
  bsky('info', 'disinformation fake video'),
  bsky('security', 'ceasefire hostage troops'),
  gnews('cyber', 'cyberattack OR "power outage" OR sabotage OR "undersea cable"'),
]
