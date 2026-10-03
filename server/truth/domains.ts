/**
 * EDITABLE heuristics for coverage analysis. These lists are a transparent
 * starting point, not a ruling: tune them to your own source policy.
 */
const ESTABLISHED = [
  'reuters.com', 'apnews.com', 'afp.com', 'bbc.com', 'bbc.co.uk', 'dw.com', 'france24.com', 'rfi.fr', 'lemonde.fr',
  'nytimes.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'economist.com', 'theguardian.com',
  'cnn.com', 'npr.org', 'pbs.org', 'cbsnews.com', 'nbcnews.com', 'abcnews.go.com', 'aljazeera.com', 'politico.com',
  'politico.eu', 'euronews.com', 'spiegel.de', 'zeit.de', 'elpais.com', 'corriere.it', 'kyivindependent.com',
  'timesofisrael.com', 'haaretz.com', 'thehindu.com', 'straitstimes.com', 'abc.net.au', 'cbc.ca', 'japantimes.co.jp',
  'scmp.com', 'ukrinform.net', 'pravda.com.ua', 'meduza.io', 'sky.com', 'bellingcat.com', 'defensenews.com', 'twz.com',
]
const STATE = [
  'rt.com', 'sputniknews.com', 'sputnikglobe.com', 'tass.com', 'tass.ru', 'ria.ru', 'xinhuanet.com', 'news.cn',
  'cgtn.com', 'globaltimes.cn', 'chinadaily.com.cn', 'presstv.ir', 'presstv.com', 'presstv.co.uk', 'irna.ir', 'kcna.kp', 'kcnawatch.org',
  'telesurtv.net', 'almanar.com.lb', 'sana.sy', 'belta.by',
]

const match = (domain: string, list: string[]) =>
  list.find((d) => domain === d || domain.endsWith('.' + d))

export const establishedOutlet = (domain: string) => match(domain.toLowerCase(), ESTABLISHED)
export const stateOutlet = (domain: string) => match(domain.toLowerCase(), STATE)
