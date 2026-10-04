// Builds server/data/countries.json from a local checkout of the CIA World Factbook JSON
// (https://github.com/factbook/factbook.json, public domain):
//   git clone --depth 1 https://github.com/factbook/factbook.json /tmp/factbook
//   node scripts/build-countries.mjs /tmp/factbook
// Keeps a trimmed record per country: people, government, economy and trade, energy, military, issues.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (!root) throw new Error('usage: node scripts/build-countries.mjs <factbook.json checkout>')

const strip = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&([a-z])(acute|grave|circ|uml|tilde|cedil);/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim()
/** Text of a field: plain {text}, or the newest year of {"X 2024": {text}, "X 2023": ...}. */
const text = (v) => {
  if (!v) return undefined
  if (typeof v === 'string') return strip(v)
  if (v.text) return strip(v.text)
  const years = Object.entries(v).filter(([k, x]) => /\d{4}/.test(k) && x && x.text).sort((a, b) => b[0].localeCompare(a[0]))
  return years[0] ? strip(years[0][1].text) : undefined
}
const sub = (v, k) => (v && v[k] ? text(v[k]) : undefined)
const UNIT = { trillion: 1e12, billion: 1e9, million: 1e6 }
/** "$822.046 billion (2024 est.)" -> 822046000000 */
const money = (s) => {
  const m = s && s.match(/-?\$?(-?[\d,.]+)\s*(trillion|billion|million)?/)
  return m ? Math.round(Number(m[1].replace(/,/g, '')) * (UNIT[m[2]] ?? 1)) : undefined
}
const pct = (s) => {
  const m = s && s.match(/(-?[\d.]+)%/)
  return m ? Number(m[1]) : undefined
}
const num = (s) => {
  const m = s && s.match(/(-?[\d,.]+)\s*(trillion|billion|million)?/)
  return m ? Math.round(Number(m[1].replace(/,/g, '')) * (UNIT[m[2]] ?? 1)) : undefined
}
const noYear = (s) => s && s.replace(/\s*\((?:\d{4}|19|20)[^)]*\)\s*$/g, '').replace(/\s*\(\d{4}[^)]*\)/g, '').trim()
/** "USA 19%, UAE 7%, China 4% (2023)" -> [{name, share}] */
const partners = (s) =>
  s
    ? noYear(s)
        .split(/,\s*/)
        .map((p) => p.match(/^(.+?)\s+([\d.]+)%$/))
        .filter(Boolean)
        .map((m) => ({ name: m[1].trim(), share: Number(m[2]) }))
    : []
/** Splits on commas/semicolons that are not inside parentheses. */
const list = (s, max = 12) => {
  if (!s) return []
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of noYear(s)) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if ((ch === ',' || ch === ';') && depth === 0) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out.slice(0, max)
}

const out = {}
for (const region of readdirSync(root)) {
  if (['meta', 'world', 'oceans', 'antarctica'].includes(region)) continue
  let files
  try {
    files = readdirSync(join(root, region)).filter((f) => /^[a-z]{2}\.json$/.test(f))
  } catch {
    continue
  }
  for (const f of files) {
    const d = JSON.parse(readFileSync(join(root, region, f), 'utf8'))
    const G = d.Government ?? {}
    const E = d.Economy ?? {}
    const P = d['People and Society'] ?? {}
    const Geo = d.Geography ?? {}
    const En = d.Energy ?? {}
    const M = d['Military and Security'] ?? {}
    const T = d['Transnational Issues'] ?? {}
    const short = sub(G['Country name'], 'conventional short form')
    const long = sub(G['Country name'], 'conventional long form')
    // Some countries have no short form ("none": CAR, UAE, Micronesia) or a truncated one ("The Dominican"): use the long form.
    const name = short === 'DRC' ? 'Democratic Republic of the Congo' : !short || short === 'none' || short === 'The Dominican' ? long?.replace(/^Federated States of /, '') : short
    if (!name || name === 'none') continue
    const exportsUsd = money(text(E.Exports))
    const importsUsd = money(text(E.Imports))
    out[name] = {
      name,
      fips: f.slice(0, 2),
      region,
      longName: sub(G['Country name'], 'conventional long form'),
      background: text(d.Introduction?.Background)?.slice(0, 900),
      capital: sub(G.Capital, 'name')?.replace(/;.*$/, ''),
      governmentType: text(G['Government type']),
      chiefOfState: sub(G['Executive branch'], 'chief of state')?.replace(/;.*$/, ''),
      headOfGovernment: sub(G['Executive branch'], 'head of government')?.replace(/;.*$/, ''),
      // Full memberships only: observer, partner, candidate and guest seats are not membership.
      organizations: list(text(G['International organization participation']), 200)
        .filter((o) => !/\((?:observer|dialogue partner|partner|candidate|guest|associate|suspended)[^)]*\)/i.test(o))
        .map((o) => o.replace(/\s*\(.*?\)\s*/g, ''))
        .filter(Boolean),
      independence: text(G.Independence),
      area: num(sub(Geo.Area, 'total ')) ?? num(sub(Geo.Area, 'total')),
      borders: (sub(Geo['Land boundaries'], 'border countries') ?? '')
        .split(/;\s*/)
        .map((b) => b.match(/^(.+?)\s+([\d,.]+)\s*km/))
        .filter(Boolean)
        .map((m) => ({ name: m[1].replace(/\s*\(.*$/, '').trim(), km: Number(m[2].replace(/,/g, '')) })),
      coastlineKm: num(text(Geo.Coastline)),
      resources: list(text(Geo['Natural resources']), 20),
      hazards: list(text(Geo['Natural hazards']), 6),
      population: num(sub(P.Population, 'total') ?? text(P.Population)),
      medianAge: num(sub(P['Median age'], 'total')),
      urbanPct: pct(sub(P.Urbanization, 'urban population')),
      lifeExpectancy: num(sub(P['Life expectancy at birth'], 'total population')),
      ethnicGroups: list(text(P['Ethnic groups']), 8),
      languages: list(text(P.Languages?.Languages ?? P.Languages), 8),
      religions: list(text(P.Religions), 8),
      majorCities: list(text(P['Major urban areas - population']), 6),
      gdpPpp: money(text(E['Real GDP (purchasing power parity)'])),
      gdpUsd: money(text(E['GDP (official exchange rate)'])),
      gdpGrowth: pct(text(E['Real GDP growth rate'])),
      gdpPerCapita: money(text(E['Real GDP per capita'])),
      inflation: pct(text(E['Inflation rate (consumer prices)'])),
      unemployment: pct(text(E['Unemployment rate'])),
      publicDebtPct: pct(text(E['Public debt'])),
      budget: { revenue: money(sub(E.Budget, 'revenues')), spending: money(sub(E.Budget, 'expenditures')) },
      reservesUsd: money(text(E['Reserves of foreign exchange and gold'])),
      currentAccountUsd: money(text(E['Current account balance'])),
      composition: {
        agriculture: pct(sub(E['GDP - composition, by sector of origin'], 'agriculture')),
        industry: pct(sub(E['GDP - composition, by sector of origin'], 'industry')),
        services: pct(sub(E['GDP - composition, by sector of origin'], 'services')),
      },
      industries: list(text(E.Industries), 10),
      agriculture: list(text(E['Agricultural products']), 8),
      exportsUsd,
      importsUsd,
      exportCommodities: list(text(E['Exports - commodities']), 6),
      importCommodities: list(text(E['Imports - commodities']), 6),
      exportPartners: partners(text(E['Exports - partners'])),
      importPartners: partners(text(E['Imports - partners'])),
      currency: sub(E['Exchange rates'], 'Currency')?.replace(/\s+per US dollar.*$/i, '').trim(),
      usdRate: Number(text(E['Exchange rates'])?.match(/[\d.]+/)?.[0]) || undefined,
      oil: {
        productionBbl: num(sub(En.Petroleum, 'total petroleum production')),
        consumptionBbl: num(sub(En.Petroleum, 'refined petroleum consumption')),
        reservesBbl: num(sub(En.Petroleum, 'crude oil estimated reserves')),
      },
      gas: {
        productionM3: num(sub(En['Natural gas'], 'production')),
        consumptionM3: num(sub(En['Natural gas'], 'consumption')),
        exportsM3: num(sub(En['Natural gas'], 'exports')),
      },
      electricityAccess: pct(sub(En['Electricity access'], 'electrification - total population')),
      military: {
        expenditurePct: pct(text(M['Military expenditures'])),
        forces: text(M['Military and security forces'])?.slice(0, 400),
        personnel: text(M['Military and security service personnel strengths'])?.slice(0, 300),
        equipment: text(M['Military equipment inventories and acquisitions'])?.slice(0, 300),
      },
      terroristGroups: list(text(d.Terrorism?.['Terrorist group(s)']), 8),
      refugees: text(T['Refugees and internally displaced persons'])?.slice(0, 300),
      disputes: text(T['Disputes - international'])?.slice(0, 500),
      ports: text(d.Transportation?.Ports)?.slice(0, 200),
    }
  }
}
mkdirSync('server/data', { recursive: true })
writeFileSync('server/data/countries.json', JSON.stringify(out))
console.log(`countries: ${Object.keys(out).length}`)
