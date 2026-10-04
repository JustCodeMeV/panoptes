import type { Ownership } from './domains.ts'

/**
 * ISSUERS: governments, international organisations and think tanks whose own
 * publications we read (layers `statements` and `research`).
 *
 * Same rule as the outlet registry, for every bloc: classed by who funds and
 * controls them, never by their line. `state` = a government body or a body
 * founded, funded and steered by one (RIAC, CIIS, Valdai, the Al Jazeera Centre);
 * `public` = publicly funded with statutory independence (SIPRI); `private` =
 * independent (ISW, RUSI, ORF...). Funding ties that matter go in `note`.
 */
export type IssuerKind = 'government' | 'intl-org' | 'think-tank'
export type Issuer = { domain: string; name: string; country: string; kind: IssuerKind; own: Ownership; note?: string }

const g = (country: string, name: string, ...domains: string[]): Issuer[] => domains.map((domain) => ({ domain, name, country, kind: 'government', own: 'state' }))
const t = (country: string, name: string, own: Ownership, domain: string, note?: string): Issuer => ({ domain, name, country, kind: 'think-tank', own, ...(note ? { note } : {}) })

export const ISSUERS: Issuer[] = [
  // --- governments: foreign and defence ministries, heads of state ---
  ...g('United States', 'US State Department', 'state.gov'),
  ...g('United States', 'US Department of Defense', 'defense.gov'),
  ...g('United States', 'The White House', 'whitehouse.gov'),
  ...g('Russia', 'Kremlin (Russian presidency)', 'kremlin.ru'),
  ...g('Russia', 'Russian Foreign Ministry', 'mid.ru'),
  ...g('Russia', 'Russian Defence Ministry', 'mil.ru'),
  ...g('China', 'Chinese Foreign Ministry', 'fmprc.gov.cn', 'mfa.gov.cn'),
  ...g('China', 'Chinese Defence Ministry', 'mod.gov.cn'),
  ...g('China', 'Chinese State Council', 'english.www.gov.cn', 'gov.cn'),
  ...g('Ukraine', 'Ukrainian Foreign Ministry', 'mfa.gov.ua'),
  ...g('Ukraine', 'Ukrainian presidency', 'president.gov.ua'),
  ...g('India', 'Indian External Affairs Ministry', 'mea.gov.in'),
  ...g('Turkey', 'Turkish Foreign Ministry', 'mfa.gov.tr'),
  ...g('Iran', 'Iranian Foreign Ministry', 'mfa.ir'),
  ...g('France', 'French Foreign Ministry', 'diplomatie.gouv.fr'),
  ...g('United Kingdom', 'UK government (FCDO, MoD)', 'gov.uk'),
  ...g('Germany', 'German Foreign Office', 'auswaertiges-amt.de'),
  ...g('Israel', 'Israeli government', 'gov.il'),
  ...g('Saudi Arabia', 'Saudi Foreign Ministry', 'mofa.gov.sa'),
  ...g('United Arab Emirates', 'UAE Foreign Ministry', 'mofa.gov.ae'),
  ...g('Japan', 'Japanese Foreign Ministry', 'mofa.go.jp'),
  ...g('South Korea', 'South Korean Foreign Ministry', 'mofa.go.kr'),
  ...g('South Africa', 'South African Foreign Ministry (DIRCO)', 'dirco.gov.za'),
  ...g('Mexico', 'Mexican Foreign Ministry', 'cancilleria.gob.mx'),
  ...g('Brazil', 'Brazilian Foreign Ministry', 'itamaraty.gov.br'),
  ...g('Pakistan', 'Pakistani Foreign Ministry', 'mofa.gov.pk'),
  // --- international organisations (intergovernmental: their members speak through them) ---
  { domain: 'consilium.europa.eu', name: 'Council of the EU', country: 'Belgium', kind: 'intl-org', own: 'state' },
  { domain: 'eeas.europa.eu', name: 'EU External Action Service', country: 'Belgium', kind: 'intl-org', own: 'state' },
  { domain: 'nato.int', name: 'NATO', country: 'Belgium', kind: 'intl-org', own: 'state' },
  { domain: 'news.un.org', name: 'United Nations', country: 'United States', kind: 'intl-org', own: 'public', note: 'UN Secretariat news service' },
  { domain: 'press.un.org', name: 'United Nations', country: 'United States', kind: 'intl-org', own: 'public' },
  { domain: 'reliefweb.int', name: 'ReliefWeb (UN OCHA)', country: 'Switzerland', kind: 'intl-org', own: 'public' },
  { domain: 'who.int', name: 'World Health Organization', country: 'Switzerland', kind: 'intl-org', own: 'public' },
  // --- think tanks and research groups, every bloc ---
  t('United States', 'Institute for the Study of War', 'private', 'understandingwar.org'),
  t('United States', 'CSIS', 'private', 'csis.org', 'part-funded by governments and defence firms'),
  t('United States', 'Carnegie Endowment', 'private', 'carnegieendowment.org'),
  t('United States', 'RAND', 'private', 'rand.org', 'mostly funded by US government contracts'),
  t('United States', 'Brookings', 'private', 'brookings.edu'),
  t('United States', 'Council on Foreign Relations', 'private', 'cfr.org'),
  t('United States', 'War on the Rocks', 'private', 'warontherocks.com'),
  t('United Kingdom', 'RUSI', 'private', 'rusi.org', 'part-funded by the UK government'),
  t('United Kingdom', 'Chatham House', 'private', 'chathamhouse.org'),
  t('United Kingdom', 'IISS', 'private', 'iiss.org', 'part-funded by Gulf governments'),
  t('Netherlands', 'Bellingcat', 'private', 'bellingcat.com'),
  t('Belgium', 'International Crisis Group', 'private', 'crisisgroup.org', 'part-funded by governments'),
  t('Germany', 'MERICS', 'private', 'merics.org'),
  t('Germany', 'ECFR', 'private', 'ecfr.eu'),
  t('Sweden', 'SIPRI', 'public', 'sipri.org', 'core funding from the Swedish government'),
  t('Russia', 'Valdai Discussion Club', 'state', 'valdaiclub.com', 'run by a foundation close to the Kremlin'),
  t('Russia', 'Russian International Affairs Council', 'state', 'russiancouncil.ru', 'founded by presidential decree, chaired from the foreign ministry'),
  t('China', 'China Institute of International Studies', 'state', 'ciis.org.cn', "the foreign ministry's think tank"),
  t('China', 'CICIR', 'state', 'cicir.ac.cn', 'linked to the Ministry of State Security'),
  t('India', 'Observer Research Foundation', 'private', 'orfonline.org', 'funded by Reliance Industries'),
  t('India', 'MP-IDSA', 'state', 'idsa.in', 'funded by the Indian defence ministry'),
  t('Turkey', 'SETA', 'private', 'setav.org', "close to Turkey's governing party"),
  t('Qatar', 'Al Jazeera Centre for Studies', 'state', 'studies.aljazeera.net', 'part of the Qatari state-funded Al Jazeera network'),
  t('South Africa', 'Institute for Security Studies', 'private', 'issafrica.org', 'donor-funded'),
]

export function issuerOf(domain: string): Issuer | undefined {
  const d = domain.toLowerCase().replace(/^www\./, '')
  let best: Issuer | undefined
  for (const x of ISSUERS) if ((d === x.domain || d.endsWith('.' + x.domain)) && (!best || x.domain.length > best.domain.length)) best = x
  return best
}
