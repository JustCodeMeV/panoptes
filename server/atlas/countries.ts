import data from '../data/countries.json' with { type: 'json' }

/**
 * Country reference data (CIA World Factbook, trimmed by scripts/build-countries.mjs),
 * with name resolution between the Factbook, the gazetteer and trade-partner shorthand.
 */

export type Partner = { name: string; share: number }
export type CountryRecord = {
  name: string
  fips: string
  region: string
  longName?: string
  background?: string
  capital?: string
  governmentType?: string
  chiefOfState?: string
  headOfGovernment?: string
  organizations: string[]
  independence?: string
  area?: number
  borders: { name: string; km: number }[]
  coastlineKm?: number
  resources: string[]
  hazards: string[]
  population?: number
  medianAge?: number
  urbanPct?: number
  lifeExpectancy?: number
  ethnicGroups: string[]
  languages: string[]
  religions: string[]
  majorCities: string[]
  gdpPpp?: number
  gdpUsd?: number
  gdpGrowth?: number
  gdpPerCapita?: number
  inflation?: number
  unemployment?: number
  publicDebtPct?: number
  budget: { revenue?: number; spending?: number }
  reservesUsd?: number
  currentAccountUsd?: number
  composition: { agriculture?: number; industry?: number; services?: number }
  industries: string[]
  agriculture: string[]
  exportsUsd?: number
  importsUsd?: number
  exportCommodities: string[]
  importCommodities: string[]
  exportPartners: Partner[]
  importPartners: Partner[]
  currency?: string
  usdRate?: number
  oil: { productionBbl?: number; consumptionBbl?: number; reservesBbl?: number }
  gas: { productionM3?: number; consumptionM3?: number; exportsM3?: number }
  electricityAccess?: number
  military: { expenditurePct?: number; forces?: string; personnel?: string; equipment?: string }
  terroristGroups: string[]
  refugees?: string
  disputes?: string
  ports?: string
}

export const COUNTRIES = data as unknown as Record<string, CountryRecord>

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')

/** Gazetteer names, partner shorthand and common variants -> Factbook name. */
const ALIASES: Record<string, string> = {
  usa: 'United States', us: 'United States', unitedstatesofamerica: 'United States', uae: 'United Arab Emirates',
  uk: 'United Kingdom', britain: 'United Kingdom', greatbritain: 'United Kingdom', myanmar: 'Burma', congo: 'Democratic Republic of the Congo',
  drcongo: 'Democratic Republic of the Congo', drc: 'Democratic Republic of the Congo', republicofthecongo: 'Congo (Brazzaville)',
  ivorycoast: "Cote d'Ivoire", czechrepublic: 'Czechia', bahamas: 'The Bahamas', gambia: 'The Gambia', capeverde: 'Cabo Verde',
  easttimor: 'Timor-Leste', macedonia: 'North Macedonia', swaziland: 'Eswatini', turkiye: 'Turkey', turkeyturkiye: 'Turkey',
  palestine: 'West Bank', gaza: 'Gaza, Gaza Strip', vatican: 'Holy See (Vatican City)', korea: 'South Korea', southkorea: 'South Korea',
  koreasouth: 'South Korea', koreanorth: 'North Korea', russianfederation: 'Russia', hongkong: 'Hong Kong', taiwanprovinceofchina: 'Taiwan',
  bosnia: 'Bosnia and Herzegovina', westernsahara: 'Western Sahara', northerncyprus: 'Cyprus', somaliland: 'Somalia',
  // Natural Earth abbreviations (what the client globe sends)
  demrepcongo: 'Democratic Republic of the Congo', centralafricanrep: 'Central African Republic', ssudan: 'South Sudan', bosniaandherz: 'Bosnia and Herzegovina',
  eqguinea: 'Equatorial Guinea', dominicanrep: 'Dominican Republic', solomonis: 'Solomon Islands', wsahara: 'Western Sahara', ncyprus: 'Cyprus',
  falklandis: 'Falkland Islands (Islas Malvinas)', eswatini: 'Eswatini', faeroeislands: 'Faroe Islands', macao: 'Macau', aland: 'Finland', ashmoreandcartierislands: 'Australia',
  indianoceanterritory: 'Australia', saintmartin: 'Saint Martin', saintbarthelemy: 'Saint Barthelemy', usvirginislands: 'Virgin Islands', usvirginis: 'Virgin Islands',
  southgeorgiaandtheislands: 'South Georgia and South Sandwich Islands', wallisandfutunaislands: 'Wallis and Futuna', frsantarcticlands: 'France', heardislandandmcdonaldislands: 'Australia',
}

const byNorm = new Map(Object.keys(COUNTRIES).map((k) => [norm(k), k]))

// Natural Earth map labels abbreviate: "Turks and Caicos Is.", "St. Vin. and Gren.", "Fr. Polynesia", "Br. Indian Ocean Ter."
const ABBR: [RegExp, string][] = [
  [/\bIs\./g, 'Islands'], [/\bI\./g, 'Island'], [/\bSt[.-]\s*/g, 'Saint '], [/\bFr\./g, 'French'], [/\bBr\./g, 'British'], [/\bTer\./g, 'Territory'],
  [/\bN\./g, 'Northern'], [/\bS\./g, 'South'], [/\bRep\./g, 'Republic'], [/\bVin\./g, 'Vincent'], [/\bGren\./g, 'the Grenadines'], [/\bBarb\./g, 'Barbuda'], [/\bGeo\./g, 'Georgia'],
]
const expand = (s: string) => ABBR.reduce((t, [re, w]) => t.replace(re, w), s)

/** Factbook record for any reasonable country name, or undefined. */
export function findCountry(name: string): CountryRecord | undefined {
  const look = (s: string) => {
    const n = norm(s)
    const key = byNorm.get(n) ?? byNorm.get(norm(ALIASES[n] ?? ''))
    return key ? COUNTRIES[key] : undefined
  }
  const found = look(name) ?? look(expand(name))
  if (found) return found
  // Last resort: a Factbook name that starts with the label ("Saint Helena" -> "Saint Helena, Ascension, and Tristan da Cunha").
  const n = norm(expand(name))
  if (n.length < 5) return undefined
  for (const [k, key] of byNorm) if (k.startsWith(n)) return COUNTRIES[key]
  return undefined
}

/** Display name that the gazetteer / map uses for a Factbook name (reverse of the aliases where needed). */
const DISPLAY: Record<string, string> = { Burma: 'Myanmar', 'Democratic Republic of the Congo': 'Congo', "Cote d'Ivoire": 'Ivory Coast', 'Gaza, Gaza Strip': 'Gaza' }
export const displayName = (factbookName: string) => DISPLAY[factbookName] ?? factbookName

/** Percentile (0..100) of a value among all countries that have it. */
export function percentile(get: (c: CountryRecord) => number | undefined, value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const all = Object.values(COUNTRIES)
    .map(get)
    .filter((v): v is number => v !== undefined && Number.isFinite(v))
  if (!all.length) return undefined
  return Math.round((all.filter((v) => v <= value).length / all.length) * 100)
}

// Alliances and blocs that matter for the diplomacy lens (Factbook abbreviations).
export const BLOCS: Record<string, string> = {
  NATO: 'NATO', EU: 'European Union', CSTO: 'CSTO', SCO: 'Shanghai Cooperation Org.', BRICS: 'BRICS', AU: 'African Union',
  LAS: 'Arab League', GCC: 'Gulf Cooperation Council', ASEAN: 'ASEAN', OPEC: 'OPEC', OAS: 'Organization of American States',
  CIS: 'CIS', OECD: 'OECD', 'G-7': 'G7', 'G-20': 'G20', EAEU: 'Eurasian Economic Union', ECOWAS: 'ECOWAS', OIC: 'Org. of Islamic Cooperation', NAM: 'Non-Aligned Movement',
}
export const blocsOf = (c: CountryRecord) => c.organizations.filter((o) => o in BLOCS)

export const NUCLEAR = new Set(['United States', 'Russia', 'China', 'France', 'United Kingdom', 'India', 'Pakistan', 'North Korea', 'Israel'])

/** Countries under broad, country-wide sanctions regimes (UN, US, EU); a factual list, not a judgement. */
export const SANCTIONED = new Set(['Russia', 'Iran', 'North Korea', 'Syria', 'Cuba', 'Venezuela', 'Belarus', 'Burma'])
