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

/** Google News over several outlet sites whose own RSS refuses us, last day. */
const sitesFeed = (id: string, domains: string[]): NewsFeed => ({
  id: `gnews:${id}`,
  domain: 'news.google.com',
  everyMs: 5 * 60_000,
  url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${domains.map((d) => `site:${d}`).join(' OR ')} when:1d`)}&hl=en-US&gl=US&ceid=US:en`,
})
/** Google News in another language edition (Spanish for Latin America, Portuguese for Brazil, French for francophone Africa). */
const gnewsLang = (id: string, q: string, hl: string, gl: string): NewsFeed => ({
  id: `gnews:${id}`,
  domain: 'news.google.com',
  everyMs: 3 * 60_000,
  url: `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:6h')}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split('-')[0]}`,
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
  { id: 'thehackernews', url: 'https://feeds.feedburner.com/TheHackersNews', domain: 'thehackernews.com' },
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
  // --- Africa ---
  { id: 'allafrica', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', domain: 'allafrica.com' },
  { id: 'dabanga', url: 'https://www.dabangasudan.org/en/feed', domain: 'dabangasudan.org' },
  { id: 'theafricareport', url: 'https://www.theafricareport.com/feed/', domain: 'theafricareport.com' },
  sitesFeed('africa-press', ['sudantribune.com', 'addisstandard.com', 'garoweonline.com', 'nation.africa', 'theeastafrican.co.ke', 'mg.co.za', 'premiumtimesng.com', 'thecitizen.co.tz', 'monitor.co.ug']),
  gnews('africa-conflict', 'Sudan OR Sahel OR Mali OR "Burkina Faso" OR Niger OR Somalia OR Congo OR Ethiopia OR Mozambique OR Nigeria attack OR fighting OR clashes', 'NG'),
  gnews('africa-politics', 'Africa protest OR coup OR election OR crackdown', 'KE'),
  gnewsLang('afrique', 'attaque OR affrontements OR manifestation Mali OR "Burkina Faso" OR Niger OR Tchad OR Cameroun OR RDC OR Sénégal', 'fr', 'SN'),
  // --- Latin America and the Caribbean ---
  { id: 'mercopress', url: 'https://en.mercopress.com/rss', domain: 'mercopress.com' },
  { id: 'bbcmundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml', domain: 'bbc.co.uk' },
  { id: 'infobae', url: 'https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml', domain: 'infobae.com' },
  { id: 'insightcrime', url: 'https://insightcrime.org/feed/', domain: 'insightcrime.org' },
  { id: 'colombiareports', url: 'https://colombiareports.com/feed/', domain: 'colombiareports.com' },
  { id: 'mexnewsdaily', url: 'https://mexiconewsdaily.com/feed/', domain: 'mexiconewsdaily.com' },
  { id: 'elpais-america', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/america/portada', domain: 'elpais.com' },
  { id: 'france24-es', url: 'https://www.france24.com/es/rss', domain: 'france24.com' },
  { id: 'agenciabrasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', domain: 'agenciabrasil.ebc.com.br' },
  { id: 'prensalatina', url: 'https://www.plenglish.com/feed/', domain: 'plenglish.com' },
  sitesFeed('latam-press', ['haitiantimes.com', 'riotimesonline.com', 'ticotimes.net', 'peruvianpress.com', 'efectococuyo.com']),
  gnewsLang('latam', 'protestas OR enfrentamientos OR violencia OR ataque OR golpe México OR Colombia OR Venezuela OR Perú OR Ecuador OR Haití OR Bolivia OR Argentina', 'es-419', 'MX'),
  gnewsLang('brasil', 'protesto OR violência OR operação OR conflito', 'pt-BR', 'BR'),
  // --- Asia ---
  { id: 'irrawaddy', url: 'https://www.irrawaddy.com/feed', domain: 'irrawaddy.com' },
  { id: 'myanmarnow', url: 'https://myanmar-now.org/en/feed/', domain: 'myanmar-now.org' },
  { id: 'bangkokpost', url: 'https://www.bangkokpost.com/rss/data/topstories.xml', domain: 'bangkokpost.com' },
  { id: 'tribune-pk', url: 'https://tribune.com.pk/feed/home', domain: 'tribune.com.pk' },
  { id: 'kathmandupost', url: 'https://kathmandupost.com/rss', domain: 'kathmandupost.com' },
  sitesFeed('asia-press', ['rappler.com', 'lorientlejour.com', 'thediplomat.com', 'benarnews.org', 'kabulnow.com']),
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
