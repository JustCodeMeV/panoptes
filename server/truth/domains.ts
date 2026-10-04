import { CHANNELS } from '../telegram/channels.ts'

/**
 * OUTLET REGISTRY: one rule for every country.
 *
 * Outlets are classed by who funds and controls them, never by whether we
 * like their line, and the same rule applies to every bloc:
 *  - `state`   government-owned/funded with government-appointed editorial
 *              control: RT and Xinhua, but also VOA and RFE/RL (US government),
 *              Al Jazeera (Qatar), TRT and Anadolu (Turkey), Ukrinform (Ukraine)...
 *  - `public`  public-service broadcasters with statutory editorial
 *              independence (BBC, DW, France 24, NHK, CBC, ABC...)
 *  - `private` independently owned newsrooms, from any country
 * The convention follows the public-funding labels platforms apply to every
 * country's media (e.g. YouTube's "funded in whole or in part by ... government"
 * panels). Contested cases carry a `note`. Edit freely, but keep it symmetric.
 *
 * `state` outlets feed the "government outlet first" and "aligned government
 * outlets" campaign flags; `public` and `private` outlets count as independent
 * coverage, and corroboration needs independent outlets from more than one
 * country (one national press echoing itself is not corroboration).
 */

export type Ownership = 'state' | 'public' | 'private'
type Outlet = { domain: string; country: string; own: Ownership; note?: string }

const o = (country: string, own: Ownership, ...domains: string[]): Outlet[] => domains.map((domain) => ({ domain, country, own }))

const OUTLETS: Outlet[] = [
  // --- private newsrooms, any country ---
  ...o('US', 'private', 'reuters.com', 'apnews.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'cnn.com', 'cbsnews.com', 'nbcnews.com', 'abcnews.go.com', 'politico.com', 'defensenews.com', 'twz.com', 'al-monitor.com'),
  ...o('GB', 'private', 'theguardian.com', 'ft.com', 'economist.com', 'sky.com', 'politico.eu', 'middleeasteye.net', 'bellingcat.com', 'alaraby.co.uk'),
  ...o('FR', 'private', 'lemonde.fr', 'afp.com', 'africanews.com'),
  ...o('EU', 'private', 'euronews.com'),
  ...o('DE', 'private', 'spiegel.de', 'zeit.de'),
  ...o('ES', 'private', 'elpais.com'),
  ...o('IT', 'private', 'corriere.it'),
  ...o('UA', 'private', 'kyivindependent.com', 'pravda.com.ua'),
  ...o('RU', 'private', 'meduza.io', 'novayagazeta.eu'),
  ...o('IL', 'private', 'timesofisrael.com', 'haaretz.com'),
  ...o('IN', 'private', 'thehindu.com', 'indiatimes.com', 'hindustantimes.com', 'indianexpress.com'),
  ...o('PK', 'private', 'dawn.com'),
  ...o('SG', 'private', 'straitstimes.com', 'channelnewsasia.com'),
  ...o('HK', 'private', 'scmp.com'),
  ...o('JP', 'private', 'japantimes.co.jp', 'asahi.com'),
  ...o('ZA', 'private', 'dailymaverick.co.za'),
  ...o('NG', 'private', 'premiumtimesng.com'),
  ...o('KE', 'private', 'nation.africa'),
  ...o('AR', 'private', 'batimes.com.ar'),
  ...o('BR', 'private', 'folha.uol.com.br'),
  ...o('SA', 'private', 'arabnews.com'),
  // --- public-service broadcasters (statutory editorial independence) ---
  ...o('GB', 'public', 'bbc.com', 'bbc.co.uk'),
  ...o('DE', 'public', 'dw.com'),
  ...o('FR', 'public', 'france24.com', 'rfi.fr'),
  ...o('US', 'public', 'npr.org', 'pbs.org'),
  ...o('CA', 'public', 'cbc.ca'),
  ...o('AU', 'public', 'abc.net.au', 'sbs.com.au'),
  ...o('JP', 'public', 'nhk.or.jp'),
  ...o('KR', 'public', 'yna.co.kr'),
  // --- government-owned / -funded with government editorial control: every bloc ---
  ...o('US', 'state', 'voanews.com', 'rferl.org', 'rfa.org', 'currenttime.tv', 'alhurra.com'),
  ...o('RU', 'state', 'rt.com', 'sputniknews.com', 'sputnikglobe.com', 'tass.com', 'tass.ru', 'ria.ru'),
  ...o('BY', 'state', 'belta.by'),
  ...o('CN', 'state', 'xinhuanet.com', 'news.cn', 'cgtn.com', 'globaltimes.cn', 'chinadaily.com.cn'),
  ...o('IR', 'state', 'presstv.ir', 'presstv.com', 'presstv.co.uk', 'irna.ir', 'tasnimnews.com'),
  ...o('KP', 'state', 'kcna.kp', 'kcnawatch.org'),
  ...o('QA', 'state', 'aljazeera.com', 'aljazeera.net'),
  ...o('TR', 'state', 'trtworld.com', 'aa.com.tr'),
  ...o('UA', 'state', 'ukrinform.net', 'ukrinform.ua'),
  ...o('AE', 'state', 'wam.ae', 'thenationalnews.com'),
  ...o('SA', 'state', 'spa.gov.sa'),
  ...o('VE', 'state', 'telesurtv.net'),
  ...o('SY', 'state', 'sana.sy'),
  ...o('LB', 'state', 'almanar.com.lb'),
]
const NOTES: Record<string, string> = {
  'almanar.com.lb': "Hezbollah's broadcaster (a party, not the Lebanese state)",
  'aljazeera.com': 'funded by the Qatari state; its editorial independence is debated',
  'thenationalnews.com': 'owned by an Abu Dhabi state-linked company',
  'arabnews.com': 'privately owned, close to the Saudi state',
  'yna.co.kr': 'state-subsidised news agency with a statutory independence law',
}
for (const x of OUTLETS) if (NOTES[x.domain]) x.note = NOTES[x.domain]

// State-run Telegram channels and official government/military channels count for their government too.
for (const ch of CHANNELS)
  if ((ch.type === 'state' || ch.type === 'gov') && ch.bloc) OUTLETS.push({ domain: `t.me/${ch.handle.toLowerCase()}`, country: ch.bloc, own: 'state' })

const find = (domain: string): Outlet | undefined => {
  const d = domain.toLowerCase()
  return OUTLETS.find((x) => d === x.domain || d.endsWith('.' + x.domain))
}

/** Independent newsroom (private or public-service, any country): counts toward corroboration. */
export const establishedOutlet = (domain: string) => {
  const x = find(domain)
  return x && x.own !== 'state' ? x.domain : undefined
}
/** Government-owned/funded outlet or official government channel, any country. */
export const stateOutlet = (domain: string) => {
  const x = find(domain)
  return x?.own === 'state' ? x.domain : undefined
}
/** Country of a known outlet (ISO code, or EU). */
export const outletCountry = (domain: string) => find(domain)?.country
export const outletInfo = (domain: string) => find(domain)

/** Social accounts/channels (domain strings produced by the telegram/bluesky pollers). */
export const socialSource = (domain: string) => /^(t\.me\/|bsky:)/.test(domain)

/** Which government a state outlet speaks for (aligned-government-outlet detection), any bloc. */
export const stateBloc = (domain: string): string | undefined => {
  const x = find(domain)
  return x?.own === 'state' ? x.country : undefined
}
