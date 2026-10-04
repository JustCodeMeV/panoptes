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

/** Google News search. `gl` picks the regional edition, which decides whose outlets rank first: spread them. */
const gnews = (id: string, q: string, gl = 'US'): NewsFeed => ({
  id: `gnews:${id}`,
  domain: 'news.google.com',
  everyMs: 40_000,
  url: `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:2h')}&hl=en-${gl}&gl=${gl}&ceid=${gl}:en`,
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
  // beyond Europe and North America
  { id: 'dawn', url: 'https://www.dawn.com/feeds/home', domain: 'dawn.com' },
  { id: 'thehindu', url: 'https://www.thehindu.com/news/international/feeder/default.rss', domain: 'thehindu.com' },
  { id: 'cna', url: 'https://www.channelnewsasia.com/rssfeeds/8395986', domain: 'channelnewsasia.com' },
  { id: 'yonhap', url: 'https://en.yna.co.kr/RSS/news.xml', domain: 'yna.co.kr' },
  { id: 'dailymaverick', url: 'https://www.dailymaverick.co.za/dmrss/', domain: 'dailymaverick.co.za' },
  { id: 'premiumtimes', url: 'https://www.premiumtimesng.com/feed', domain: 'premiumtimesng.com' },
  { id: 'africanews', url: 'https://www.africanews.com/feed/rss', domain: 'africanews.com' },
  { id: 'arabnews', url: 'https://www.arabnews.com/rss.xml', domain: 'arabnews.com' },
  { id: 'almonitor', url: 'https://www.al-monitor.com/rss', domain: 'al-monitor.com' },
  { id: 'batimes', url: 'https://www.batimes.com.ar/feed', domain: 'batimes.com.ar' },
  { id: 'meduza', url: 'https://meduza.io/rss/en/all', domain: 'meduza.io' },
  { id: 'kyivindependent', url: 'https://kyivindependent.com/news-archive/rss/', domain: 'kyivindependent.com' },
  { id: 'rfi', url: 'https://www.rfi.fr/en/rss', domain: 'rfi.fr' },
  // government-funded outlets of every bloc: each is a different information stream, read with the same rule
  { id: 'rferl', url: 'https://www.rferl.org/api/', domain: 'rferl.org' },
  gnews('voa', 'site:voanews.com'),
  { id: 'anadolu', url: 'https://www.aa.com.tr/en/rss/default?cat=guncel', domain: 'aa.com.tr' },
  { id: 'xinhua', url: 'https://english.news.cn/rss/worldrss.xml', domain: 'news.cn' },
  { id: 'globaltimes', url: 'https://www.globaltimes.cn/rss/outbrain.xml', domain: 'globaltimes.cn' },
  { id: 'tass', url: 'https://tass.com/rss/v2.xml', domain: 'tass.com' },
  { id: 'rt', url: 'https://www.rt.com/rss/news/', domain: 'rt.com' },
  { id: 'presstv', url: 'https://www.presstv.ir/rss.xml', domain: 'presstv.ir' },
  { id: 'almanar', url: 'https://english.almanar.com.lb/rss', domain: 'almanar.com.lb' },
  { id: 'cgtn', url: 'https://www.cgtn.com/subscribe/rss/section/world.xml', domain: 'cgtn.com' },
  gnews('unrest', 'protest OR riot OR clashes OR unrest OR crackdown', 'IN'),
  gnews('strikes', 'missile OR airstrike OR "drone attack" OR shelling OR explosion'),
  gnews('security', 'ceasefire OR hostage OR troops OR "military buildup" OR sanctions', 'GB'),
  gnews('info', 'disinformation OR deepfake OR hoax OR "fake video" OR propaganda', 'ZA'),
  // social: Bluesky keyword search (Telegram channels are read by the scouts in server/telegram/)
  bsky('unrest', 'protest clashes'),
  bsky('strikes', 'airstrike missile drone'),
  bsky('info', 'disinformation fake video'),
  bsky('security', 'ceasefire hostage troops'),
  gnews('cyber', 'cyberattack OR "power outage" OR sabotage OR "undersea cable"', 'SG'),
]
