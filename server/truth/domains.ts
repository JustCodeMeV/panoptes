import { CHANNELS } from '../telegram/channels.ts'

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

/** Social accounts/channels (domain strings produced by the telegram/bluesky pollers). */
export const socialSource = (domain: string) => /^(t\.me\/|bsky:)/.test(domain)

/** Which state-media bloc an outlet belongs to (for coordinated-alignment detection). */
const BLOC: Record<string, string[]> = {
  RU: ['rt.com', 'sputniknews.com', 'sputnikglobe.com', 'tass.com', 'tass.ru', 'ria.ru', 'belta.by'],
  CN: ['xinhuanet.com', 'news.cn', 'cgtn.com', 'globaltimes.cn', 'chinadaily.com.cn'],
  IR: ['presstv.ir', 'presstv.com', 'presstv.co.uk', 'irna.ir', 'almanar.com.lb'],
  KP: ['kcna.kp', 'kcnawatch.org'],
}
// State-aligned Telegram channels count for their bloc too (t.me/<handle>).
for (const ch of CHANNELS) if (ch.type === 'state' && ch.bloc && ch.bloc in BLOC) BLOC[ch.bloc].push(`t.me/${ch.handle.toLowerCase()}`)

export const stateBloc = (domain: string): string | undefined => {
  const d = domain.toLowerCase()
  return Object.entries(BLOC).find(([, list]) => list.some((x) => d === x || d.endsWith('.' + x)))?.[0]
}
