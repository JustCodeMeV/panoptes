import { geoContains, type GeoPermissibleObjects } from 'd3-geo'
import type { Feature } from '../../../shared/feature.ts'
import { liveWhere } from '../../atlas/profile.ts'
import { regionsFor, type Region } from '../../atlas/regions.ts'
import type { Provider } from '../../core/provider.ts'

/**
 * CONFLICT ZONES: every active war, not only Ukraine. No open, keyless
 * territorial-control feed exists outside Ukraine (DeepState), so each conflict
 * is drawn as the first-level regions where it is being fought (a curated
 * baseline, real administrative boundaries from geoBoundaries), shaded by what
 * our own live layers report there now (conflict log, checked events, unrest,
 * news, Telegram). Parties are listed neutrally, in no order of legitimacy.
 */
type Conflict = { id: string; name: string; parties: string[]; since: string; areas: { country: string; regions: string[] }[]; note?: string }

export const CONFLICTS: Conflict[] = [
  { id: 'ukraine', name: 'Russia–Ukraine war', parties: ['Russian Armed Forces', 'Armed Forces of Ukraine'], since: '2014 (full-scale 2022)', areas: [{ country: 'Ukraine', regions: ['Donetsk', 'Luhansk', 'Zaporizhia', 'Kherson', 'Kharkiv', 'Sumy', 'Dnipropetrovsk', 'Autonomous Republic of Crimea', 'Sevastopol'] }], note: 'Front line itself: DeepState polygons in this layer' },
  { id: 'sudan', name: 'Sudanese civil war', parties: ['Sudanese Armed Forces (SAF)', 'Rapid Support Forces (RSF)'], since: '2023', areas: [{ country: 'Sudan', regions: ['North Darfur', 'South Darfur', 'West Darfur', 'Central Darfur', 'East Darfur', 'North Kordofan', 'South Kordofan', 'West Kordofan', 'Khartoum', 'Gezira', 'Sennar', 'Blue Nile', 'White Nile'] }] },
  { id: 'gaza', name: 'Israel–Hamas war', parties: ['Israel Defense Forces', 'Hamas', 'Palestinian Islamic Jihad'], since: '2023', areas: [{ country: 'Palestine', regions: ['Gaza'] }, { country: 'Israel', regions: ['Southern'] }] },
  { id: 'lebanon', name: 'Israel–Hezbollah conflict', parties: ['Israel Defense Forces', 'Hezbollah'], since: '2023', areas: [{ country: 'Lebanon', regions: ['Liban-Sud', 'Nabatîyé', 'Baalbek-Hermel', 'Béqaa'] }, { country: 'Israel', regions: ['Northern'] }] },
  { id: 'west-bank', name: 'West Bank violence', parties: ['Israel Defense Forces and settlers', 'Palestinian armed groups'], since: '2022', areas: [{ country: 'Palestine', regions: ['West Bank'] }] },
  { id: 'syria', name: 'Syria: post-war fighting', parties: ['Syrian transitional government', 'Syrian Democratic Forces (SDF)', 'Turkish-backed factions', 'Islamic State remnants', 'Israeli strikes'], since: '2011', areas: [{ country: 'Syria', regions: ['Aleppo', 'Ar-Raqqa', 'Deir-ez-Zor', 'Al-Hasakeh', 'As-Sweida', 'Lattakia', 'Tartous', 'Homs', 'Idleb'] }] },
  { id: 'yemen', name: 'Yemeni war and Red Sea attacks', parties: ['Ansar Allah (Houthis)', 'Yemeni government and allies', 'Southern Transitional Council', 'US/Israeli strikes'], since: '2014', areas: [{ country: 'Yemen', regions: ["Ma'rib", "Ta'izz", 'Al Hudaydah', "Ad Dali'", "Sa'dah", 'Al Jawf', "Al Bayda'", 'Hajjah'] }] },
  { id: 'myanmar', name: 'Myanmar civil war', parties: ['Myanmar military (Tatmadaw)', 'People’s Defence Forces / NUG', 'Ethnic armed organisations (AA, KIA, TNLA, MNDAA, KNU...)'], since: '2021', areas: [{ country: 'Burma', regions: ['Shan', 'Kachin', 'Rakhine', 'Saigang', 'Sagaing', 'Chin', 'Kayah', 'Kayin', 'Magway', 'Mandalay'] }] },
  { id: 'drc', name: 'Eastern DR Congo war', parties: ['FARDC (Congolese army) and allies', 'M23 / AFC', 'ADF', 'CODECO and other militias'], since: '2022 (M23 resurgence)', areas: [{ country: 'Dem. Rep. Congo', regions: ['North Kivu', 'South Kivu', 'Ituri', 'Tanganyika', 'Maniema'] }] },
  { id: 'sahel', name: 'Sahel insurgencies', parties: ['Mali, Burkina Faso and Niger juntas (and Russian Africa Corps)', 'JNIM (al-Qaeda affiliate)', 'Islamic State Sahel', 'Tuareg separatists (FLA)'], since: '2012', areas: [{ country: 'Mali', regions: ['Mopti', 'Segou', 'Tombouctou', 'Gao', 'Kidal', 'Koulikouro'] }, { country: 'Burkina Faso', regions: ['Sahel', 'Est', 'Nord', 'Boucle du Mouhoun', 'Centre-Nord', 'Centre-Est'] }, { country: 'Niger', regions: ['Tillaberi', 'Tahoua/Agadez', 'Zinder/Diffa'] }] },
  { id: 'lake-chad', name: 'Lake Chad basin and Nigeria', parties: ['Nigerian, Cameroonian and Chadian forces', 'Boko Haram (JAS)', 'ISWAP', 'armed bandit groups (north-west Nigeria)'], since: '2009', areas: [{ country: 'Nigeria', regions: ['Borno', 'Yobe', 'Adamawa', 'Zamfara', 'Katsina', 'Sokoto', 'Kaduna', 'Niger', 'Benue', 'Plateau'] }, { country: 'Cameroon', regions: ['Far North'] }] },
  { id: 'somalia', name: 'Somalia: al-Shabaab insurgency', parties: ['Somali federal forces, AUSSOM and allies', 'al-Shabaab', 'Islamic State Somalia'], since: '2006', areas: [{ country: 'Somalia', regions: ['Lower Shebelle', 'Middle Shebelle', 'Hiiraan', 'Bay', 'Bakool', 'Gedo', 'Lower Juba', 'Middle Juba', 'Galgaduud', 'Mudug'] }] },
  { id: 'ethiopia', name: 'Ethiopia: Amhara and Oromia insurgencies', parties: ['Ethiopian National Defense Force', 'Fano militias (Amhara)', 'Oromo Liberation Army'], since: '2023', areas: [{ country: 'Ethiopia', regions: ['Amhara', 'Oromia'] }] },
  { id: 'south-sudan', name: 'South Sudan violence', parties: ['SPLA-IO and SSPDF factions', 'White Army and local militias'], since: '2013', areas: [{ country: 'South Sudan', regions: ['Upper Nile', 'Jonglei', 'Unity', 'Western Equatoria'] }] },
  { id: 'mozambique', name: 'Cabo Delgado insurgency', parties: ['Mozambican and Rwandan forces', 'Islamic State Mozambique'], since: '2017', areas: [{ country: 'Mozambique', regions: ['Cabo Delgado', 'Niassa'] }] },
  { id: 'cameroon', name: 'Cameroon Anglophone conflict', parties: ['Cameroonian army', 'Ambazonian separatists'], since: '2017', areas: [{ country: 'Cameroon', regions: ['North-West', 'South-West'] }] },
  { id: 'car', name: 'Central African Republic conflict', parties: ['Government (FACA) with Russian and Rwandan forces', 'CPC rebel coalition'], since: '2012', areas: [{ country: 'Central African Republic', regions: ['Haut-Mbomou', 'Mbomou', 'Vakaga', 'Haute-Kotto', 'Ouham-Pendé'] }] },
  { id: 'haiti', name: 'Haiti gang war', parties: ['Haitian police and the Gang Suppression Force', 'Viv Ansanm gang coalition'], since: '2021', areas: [{ country: 'Haiti', regions: ["Département de l'Ouest", 'Artibonite', 'Centre'] }] },
  { id: 'colombia', name: 'Colombian armed conflict', parties: ['Colombian armed forces', 'ELN', 'FARC dissidents (EMC, Segunda Marquetalia)', 'Clan del Golfo'], since: '1964', areas: [{ country: 'Colombia', regions: ['Cauca', 'Norte de Santander', 'Arauca', 'Nariño', 'Chocó', 'Antioquia', 'Guaviare'] }] },
  { id: 'mexico', name: 'Mexican cartel conflict', parties: ['Mexican armed forces and National Guard', 'Sinaloa factions', 'CJNG and other cartels'], since: '2006', areas: [{ country: 'Mexico', regions: ['Sinaloa', 'Guerrero', 'Michoacán', 'Guanajuato', 'Chiapas', 'Tamaulipas', 'Zacatecas'] }] },
  { id: 'ecuador', name: 'Ecuador gang conflict', parties: ['Ecuadorian security forces', 'Los Choneros, Los Lobos and other gangs'], since: '2024 (internal armed conflict declared)', areas: [{ country: 'Ecuador', regions: ['Guayas', 'Los Ríos', 'Manabí', 'Esmeraldas', 'El Oro'] }] },
  { id: 'pakistan', name: 'Pakistan: TTP and Baloch insurgencies', parties: ['Pakistani army', 'Tehrik-i-Taliban Pakistan', 'Baloch Liberation Army'], since: '2007', areas: [{ country: 'Pakistan', regions: ['Khyber Pakhtunkhwa', 'Balochistan'] }] },
  { id: 'kashmir', name: 'India–Pakistan Line of Control', parties: ['Indian armed forces', 'Pakistani armed forces', 'militant groups'], since: '1947', areas: [{ country: 'India', regions: ['Jammu and Kashmir', 'Ladakh'] }, { country: 'Pakistan', regions: ['Azad Kashmir', 'Gilgit-Baltistan'] }] },
  { id: 'iraq', name: 'Iraq: IS remnants and militia strikes', parties: ['Iraqi forces', 'Islamic State remnants', 'armed factions'], since: '2014', areas: [{ country: 'Iraq', regions: ['Al-Anbar', 'Ninawa', 'Kirkuk', 'Salah al-Din', 'Diyala'] }] },
  { id: 'afghanistan', name: 'Afghanistan: IS-K and resistance attacks', parties: ['Taliban government', 'Islamic State Khorasan', 'National Resistance Front'], since: '2021', areas: [{ country: 'Afghanistan', regions: ['Nangarhar', 'Kunar', 'Panjshir', 'Kabul'] }] },
]

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\b(region|state|province|governorate|oblast|department|division|county|district)\b/g, '').replace(/[^a-z]/g, '')

/** The country's regions whose names match the list (prefix either way, accents and suffixes ignored). */
export function matchRegions(all: Region[], names: string[]): Region[] {
  const want = names.map(norm).filter(Boolean)
  return all.filter((r) => {
    const n = norm(r.name)
    // Prefix either way, but only when the names are close in length ("North" is not "North-West")
    return n && want.some((w) => n === w || (Math.min(n.length, w.length) >= 4 && Math.min(n.length, w.length) / Math.max(n.length, w.length) > 0.6 && (n.startsWith(w) || w.startsWith(n))))
  })
}

const LIVE_DAYS = 3
const intensity = (n: number) => (n >= 25 ? 'high' : n >= 6 ? 'elevated' : n > 0 ? 'low' : 'quiet')

/** Lon/lat box of a region's outer rings; null when it spans the antimeridian (always tested in full). */
function boxOf(r: Region): [number, number, number, number] | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const poly of r.geometry.type === 'Polygon' ? [r.geometry.coordinates] : r.geometry.coordinates)
    for (const [x, y] of poly[0]) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  return x1 - x0 > 180 ? null : [x0, y0, x1, y1]
}
/** Point-in-zone test: the box rules out most live items before the costly test on detailed outlines. */
function zoneTest(polys: Region[]) {
  const parts = polys.map((r) => ({ geo: r.geometry as GeoPermissibleObjects, box: boxOf(r) }))
  return (lon: number, lat: number) =>
    parts.some(({ geo, box }) => (!box || (lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3])) && geoContains(geo, [lon, lat]))
}

export const conflictsProvider: Provider = {
  id: 'conflict-zones',
  layerId: 'frontlines',
  ttlMs: 20 * 60_000,
  async fetch() {
    const out: Feature[] = []
    // One country at a time: region sets are cached on disk after the first download
    for (const c of CONFLICTS) {
      const polys: Region[] = []
      const where: string[] = []
      for (const a of c.areas) {
        const set = await regionsFor(a.country).catch(() => null)
        if (!set) continue
        const hit = matchRegions(set.set.regions, a.regions)
        polys.push(...hit)
        where.push(...hit.map((r) => `${r.name} (${a.country.replace('Dem. Rep. Congo', 'DR Congo').replace('Burma', 'Myanmar')})`))
      }
      if (!polys.length) continue
      const coordinates = polys.flatMap((r) => (r.geometry.type === 'Polygon' ? [r.geometry.coordinates] : r.geometry.coordinates))
      const inZone = zoneTest(polys)
      const cutoff = Date.now() - LIVE_DAYS * 86_400_000
      const live = await liveWhere((f) => Date.parse(f.observedAt) > cutoff && inZone(f.position!.lon, f.position!.lat))
      const reports = Object.entries(live.counts).filter(([k]) => !['ships', 'military-air', 'humanitarian', 'hazards', 'osint', 'statements'].includes(k)).reduce((s, [, n]) => s + n, 0)
      const ring = polys[0].geometry.type === 'Polygon' ? polys[0].geometry.coordinates[0] : polys[0].geometry.coordinates[0][0]
      const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length
      const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length
      out.push({
        id: `frontlines:zone-${c.id}`,
        layerId: 'frontlines',
        title: c.name,
        position: { lat, lon },
        geometry: { type: 'MultiPolygon', coordinates },
        geoPrecision: 'approximate',
        geoBasis: `regions where the conflict is fought (curated baseline, geoBoundaries outlines); activity from live layers, last ${LIVE_DAYS} days`,
        observedAt: new Date().toISOString(),
        source: { provider: 'conflict-zones', platform: 'ARGUS conflict baseline + live layers', retrievedAt: new Date().toISOString() },
        tags: ['conflict-zone', intensity(reports)],
        props: { kind: 'conflict-zone', conflict: c.name, parties: c.parties, since: c.since, regions: where, note: c.note, reports, intensity: intensity(reports), counts: live.counts, top: live.top.slice(0, 6) },
      })
    }
    return out
  },
}
