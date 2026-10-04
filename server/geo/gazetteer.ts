import { geoArea, geoBounds, geoCentroid, geoContains, type GeoPermissibleObjects } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries50 from 'world-atlas/countries-50m.json' with { type: 'json' }
import countries110 from 'world-atlas/countries-110m.json' with { type: 'json' }

/**
 * Offline gazetteer: [name, lat, lon, kind, ...aliases], plus every country from Natural Earth.
 * Each place is assigned to the country polygon it sits in, so a mention of a
 * city counts as evidence for its country (see `scoreLocations`). Extend freely.
 */
type Kind = 'place' | 'country'
type Row = [name: string, lat: number, lon: number, kind: Kind, ...aliases: string[]]

const ROWS: Row[] = [
  // --- places (cities, flashpoints, landmarks) ---
  ['Kyiv', 50.45, 30.52, 'place', 'Kiev'],
  ['Kharkiv', 49.99, 36.23, 'place', 'Kharkov'],
  ['Odesa', 46.48, 30.73, 'place', 'Odessa'],
  ['Donetsk', 48.02, 37.8, 'place'],
  ['Zaporizhzhia', 47.84, 35.14, 'place', 'Zaporozhye'],
  ['Moscow', 55.75, 37.62, 'place'],
  ['Saint Petersburg', 59.93, 30.34, 'place', 'St Petersburg', 'St. Petersburg'],
  ['Minsk', 53.9, 27.57, 'place'],
  ['Warsaw', 52.23, 21.01, 'place'],
  ['Berlin', 52.52, 13.4, 'place'],
  ['Paris', 48.86, 2.35, 'place'],
  ['Marseille', 43.3, 5.37, 'place'],
  ['Lyon', 45.76, 4.84, 'place'],
  ['London', 51.51, -0.13, 'place'],
  ['Manchester', 53.48, -2.24, 'place'],
  ['Dublin', 53.35, -6.26, 'place'],
  ['Madrid', 40.42, -3.7, 'place'],
  ['Barcelona', 41.39, 2.17, 'place'],
  ['Lisbon', 38.72, -9.14, 'place'],
  ['Rome', 41.9, 12.5, 'place'],
  ['Milan', 45.46, 9.19, 'place'],
  ['Athens', 37.98, 23.73, 'place'],
  ['Brussels', 50.85, 4.35, 'place'],
  ['Amsterdam', 52.37, 4.9, 'place'],
  ['Vienna', 48.21, 16.37, 'place'],
  ['Budapest', 47.5, 19.04, 'place'],
  ['Prague', 50.08, 14.44, 'place'],
  ['Belgrade', 44.79, 20.45, 'place'],
  ['Tbilisi', 41.72, 44.79, 'place'],
  ['Yerevan', 40.18, 44.51, 'place'],
  ['Baku', 40.41, 49.87, 'place'],
  ['Istanbul', 41.01, 28.98, 'place'],
  ['Ankara', 39.93, 32.86, 'place'],
  ['Stockholm', 59.33, 18.07, 'place'],
  ['Oslo', 59.91, 10.75, 'place'],
  ['Copenhagen', 55.68, 12.57, 'place'],
  ['Helsinki', 60.17, 24.94, 'place'],
  ['Jerusalem', 31.77, 35.21, 'place'],
  ['Tel Aviv', 32.09, 34.78, 'place'],
  ['Gaza', 31.5, 34.47, 'place', 'Gaza City', 'Gaza Strip'],
  ['Rafah', 31.3, 34.25, 'place'],
  ['West Bank', 31.95, 35.3, 'place'],
  ['Ramallah', 31.9, 35.2, 'place'],
  ['Beirut', 33.89, 35.5, 'place'],
  ['Damascus', 33.51, 36.28, 'place'],
  ['Aleppo', 36.2, 37.16, 'place'],
  ['Baghdad', 33.31, 44.37, 'place'],
  ['Tehran', 35.69, 51.39, 'place'],
  ['Isfahan', 32.65, 51.67, 'place'],
  ['Riyadh', 24.71, 46.68, 'place'],
  ['Dubai', 25.2, 55.27, 'place'],
  ['Doha', 25.29, 51.53, 'place'],
  ['Sanaa', 15.37, 44.19, 'place', "Sana'a"],
  ['Aden', 12.78, 45.04, 'place'],
  ['Strait of Hormuz', 26.57, 56.25, 'place', 'Hormuz'],
  ['Cairo', 30.04, 31.24, 'place'],
  ['Alexandria', 31.2, 29.92, 'place'],
  ['Tripoli', 32.89, 13.19, 'place'],
  ['Tunis', 36.81, 10.18, 'place'],
  ['Algiers', 36.75, 3.06, 'place'],
  ['Casablanca', 33.57, -7.59, 'place'],
  ['Khartoum', 15.5, 32.56, 'place'],
  ['Addis Ababa', 9.03, 38.74, 'place'],
  ['Nairobi', -1.29, 36.82, 'place'],
  ['Mogadishu', 2.05, 45.32, 'place'],
  ['Kampala', 0.35, 32.58, 'place'],
  ['Kinshasa', -4.44, 15.27, 'place'],
  ['Lagos', 6.52, 3.38, 'place'],
  ['Abuja', 9.08, 7.4, 'place'],
  ['Accra', 5.6, -0.19, 'place'],
  ['Dakar', 14.72, -17.47, 'place'],
  ['Johannesburg', -26.2, 28.05, 'place'],
  ['Cape Town', -33.92, 18.42, 'place'],
  ['Mumbai', 19.08, 72.88, 'place', 'Bombay'],
  ['New Delhi', 28.61, 77.21, 'place', 'Delhi'],
  ['Jantar Mantar', 28.627, 77.216, 'place', 'Jantar-Mantar'],
  ['Kolkata', 22.57, 88.36, 'place', 'Calcutta'],
  ['Bengaluru', 12.97, 77.59, 'place', 'Bangalore'],
  ['Patna', 25.59, 85.14, 'place'],
  ['Karachi', 24.86, 67.0, 'place'],
  ['Lahore', 31.55, 74.34, 'place'],
  ['Islamabad', 33.68, 73.05, 'place'],
  ['Kabul', 34.53, 69.17, 'place'],
  ['Dhaka', 23.81, 90.41, 'place'],
  ['Kathmandu', 27.72, 85.32, 'place'],
  ['Colombo', 6.93, 79.86, 'place'],
  ['Yangon', 16.87, 96.2, 'place', 'Rangoon'],
  ['Bangkok', 13.76, 100.5, 'place'],
  ['Hanoi', 21.03, 105.85, 'place'],
  ['Jakarta', -6.21, 106.85, 'place'],
  ['Manila', 14.6, 120.98, 'place'],
  ['Kuala Lumpur', 3.14, 101.69, 'place'],
  ['Singapore', 1.35, 103.82, 'place'],
  ['Hong Kong', 22.32, 114.17, 'place'],
  ['Taipei', 25.03, 121.57, 'place'],
  ['Beijing', 39.9, 116.4, 'place'],
  ['Shanghai', 31.23, 121.47, 'place'],
  ['Seoul', 37.57, 126.98, 'place'],
  ['Pyongyang', 39.04, 125.76, 'place'],
  ['Tokyo', 35.68, 139.69, 'place'],
  ['Osaka', 34.69, 135.5, 'place'],
  ['Sydney', -33.87, 151.21, 'place'],
  ['Melbourne', -37.81, 144.96, 'place'],
  ['Auckland', -36.85, 174.76, 'place'],
  ['New York', 40.71, -74.0, 'place', 'NYC', 'Manhattan', 'Brooklyn'],
  ['Washington DC', 38.9, -77.04, 'place', 'Washington D.C.', 'Capitol Hill', 'White House'],
  ['Los Angeles', 34.05, -118.24, 'place', 'LA'],
  ['San Francisco', 37.77, -122.42, 'place'],
  ['Seattle', 47.61, -122.33, 'place'],
  ['Portland', 45.52, -122.68, 'place'],
  ['Chicago', 41.88, -87.63, 'place'],
  ['Minneapolis', 44.98, -93.27, 'place'],
  ['Atlanta', 33.75, -84.39, 'place'],
  ['Miami', 25.76, -80.19, 'place'],
  ['Houston', 29.76, -95.37, 'place'],
  ['Dallas', 32.78, -96.8, 'place'],
  ['Austin', 30.27, -97.74, 'place'],
  ['Phoenix', 33.45, -112.07, 'place'],
  ['Las Vegas', 36.17, -115.14, 'place'],
  ['Denver', 39.74, -104.99, 'place'],
  ['Boston', 42.36, -71.06, 'place'],
  ['Philadelphia', 39.95, -75.17, 'place'],
  ['Detroit', 42.33, -83.05, 'place'],
  ['New Orleans', 29.95, -90.07, 'place'],
  ['Toronto', 43.65, -79.38, 'place'],
  ['Montreal', 45.5, -73.57, 'place'],
  ['Vancouver', 49.28, -123.12, 'place'],
  ['Mexico City', 19.43, -99.13, 'place'],
  ['Havana', 23.11, -82.37, 'place'],
  ['Port-au-Prince', 18.59, -72.31, 'place'],
  ['Caracas', 10.48, -66.9, 'place'],
  ['Bogota', 4.71, -74.07, 'place', 'Bogotá'],
  ['Quito', -0.18, -78.47, 'place'],
  ['Lima', -12.05, -77.04, 'place'],
  ['La Paz', -16.5, -68.15, 'place'],
  ['Santiago', -33.45, -70.67, 'place'],
  ['Buenos Aires', -34.6, -58.38, 'place'],
  ['Sao Paulo', -23.55, -46.63, 'place', 'São Paulo'],
  ['Rio de Janeiro', -22.91, -43.17, 'place', 'Rio'],
  ['Brasilia', -15.79, -47.88, 'place', 'Brasília'],


  ['Lviv', 49.84, 24.03, 'place', 'Lvov'],
  ['Dnipro', 48.46, 35.04, 'place', 'Dnipropetrovsk', 'Dnepr'],
  ['Sumy', 50.91, 34.8, 'place'],
  ['Chernihiv', 51.49, 31.29, 'place', 'Chernigov'],
  ['Poltava', 49.59, 34.55, 'place'],
  ['Mykolaiv', 46.97, 31.99, 'place', 'Nikolaev'],
  ['Kropyvnytskyi', 48.51, 32.26, 'place', 'Kirovohrad'],
  ['Kryvyi Rih', 47.91, 33.39, 'place', 'Krivoy Rog'],
  ['Pokrovsk', 48.28, 37.18, 'place'],
  ['Kramatorsk', 48.72, 37.56, 'place'],
  ['Sloviansk', 48.85, 37.6, 'place', 'Slavyansk'],
  ['Kostiantynivka', 48.53, 37.71, 'place'],
  ['Luhansk', 48.57, 39.31, 'place', 'Lugansk'],
  ['Zhytomyr', 50.25, 28.66, 'place'],
  ['Vinnytsia', 49.23, 28.47, 'place'],
  ['Cherkasy', 49.44, 32.06, 'place'],
  ['Rivne', 50.62, 26.25, 'place'],
  ['Belgorod', 50.6, 36.59, 'place'],
  ['Bryansk', 53.25, 34.37, 'place'],
  ['Voronezh', 51.67, 39.18, 'place'],
  ['Rostov-on-Don', 47.24, 39.71, 'place', 'Rostov'],
  ['Krasnodar', 45.04, 38.98, 'place'],
  ['Novorossiysk', 44.72, 37.77, 'place'],
  ['Crimea', 45.3, 34.4, 'place'],
  ['Tyre', 33.27, 35.2, 'place'],
  ['Sidon', 33.56, 35.37, 'place'],
  ['Nabatieh', 33.38, 35.48, 'place'],
  ['Hodeidah', 14.8, 42.95, 'place'],
  ['Erbil', 36.19, 44.01, 'place'],
  ['Homs', 34.73, 36.72, 'place'],
  ['Idlib', 35.93, 36.63, 'place'],
  ['Haifa', 32.79, 34.99, 'place'],
  ['Eilat', 29.56, 34.95, 'place'],
  ['Bandar Abbas', 27.18, 56.27, 'place'],
  ['Tabriz', 38.08, 46.29, 'place'],
  ['Shiraz', 29.59, 52.58, 'place'],
  ['Mashhad', 36.3, 59.6, 'place'],

  // --- sites: specific protest/flashpoint locations; beat the surrounding city ---
  ['Plaza de Cibeles', 40.4193, -3.6931, 'place', 'Cibeles'],
  ['Puerta del Sol', 40.4169, -3.7035, 'place'],
  ['Shivaji Park', 19.0274, 72.8378, 'place'],
  ['Tahrir Square', 30.0444, 31.2357, 'place'],
  ['Maidan Nezalezhnosti', 50.4501, 30.5240, 'place', 'Independence Square Kyiv', 'Maidan'],
  ['Red Square', 55.7539, 37.6208, 'place'],
  ['Kremlin', 55.7520, 37.6175, 'place'],
  ['Trafalgar Square', 51.5080, -0.1281, 'place'],
  ['Parliament Square', 51.5006, -0.1269, 'place'],
  ['Downing Street', 51.5034, -0.1276, 'place'],
  ['Place de la République', 48.8675, 2.3638, 'place', 'Place de la Republique'],
  ['Place de la Concorde', 48.8656, 2.3212, 'place'],
  ['Champs-Élysées', 48.8698, 2.3078, 'place', 'Champs-Elysees'],
  ['Brandenburg Gate', 52.5163, 13.3777, 'place', 'Brandenburger Tor'],
  ['Bundestag', 52.5186, 13.3762, 'place'],
  ['Taksim Square', 41.0370, 28.9850, 'place', 'Taksim'],
  ['Zócalo', 19.4326, -99.1332, 'place', 'Zocalo'],
  ['Knesset', 31.7767, 35.2058, 'place'],
  ['Hostages Square', 32.0742, 34.7898, 'place', 'Hostage Square'],
  ['Tiananmen Square', 39.9055, 116.3976, 'place', 'Tiananmen'],
  ['Victoria Park', 22.2825, 114.1878, 'place'],
  ['Shahbag', 23.7388, 90.3958, 'place'],
  ['Azadi Square', 35.6997, 51.3380, 'place', 'Azadi Tower'],
  ['Red Fort', 28.6562, 77.2410, 'place'],
  ['Rajpath', 28.6129, 77.2295, 'place', 'Kartavya Path'],
  ['Lincoln Memorial', 38.8893, -77.0502, 'place'],
  ['U.S. Capitol', 38.8899, -77.0091, 'place', 'US Capitol', 'Capitol Building'],
  ['The Pentagon', 38.8719, -77.0563, 'place', 'Pentagon'],
  ['Times Square', 40.7580, -73.9855, 'place'],
  ['Wall Street', 40.7060, -74.0088, 'place'],
  ['Zuccotti Park', 40.7092, -74.0113, 'place'],
  ['Syntagma Square', 37.9755, 23.7348, 'place'],
  ['Wenceslas Square', 50.0810, 14.4280, 'place'],
  ['Rustaveli Avenue', 41.6977, 44.7990, 'place'],
  ['Republic Square Yerevan', 40.1776, 44.5126, 'place'],
  ['Kherson', 46.6354, 32.6169, 'place'],
  ['Bakhmut', 48.5956, 38.0000, 'place'],
  ['Mariupol', 47.0971, 37.5434, 'place'],
  ['Kursk', 51.7304, 36.1926, 'place'],
  ['Sevastopol', 44.6167, 33.5254, 'place'],
  ['Khan Younis', 31.3462, 34.3060, 'place'],
  ['Jenin', 32.4610, 35.3000, 'place'],
  ['Tel Aviv Kirya', 32.0715, 34.7872, 'place'],
  ['Bab el-Mandeb', 12.5833, 43.3333, 'place'],
  ['Suez Canal', 30.5852, 32.2654, 'place'],
  ['Taiwan Strait', 24.5, 119.5, 'place'],

  // --- countries (centroid / capital) ---
  ['Ukraine', 49.0, 32.0, 'country'],
  ['Russia', 56.0, 38.0, 'country'],
  ['Belarus', 53.7, 27.9, 'country'],
  ['Poland', 52.0, 19.4, 'country'],
  ['Germany', 51.2, 10.4, 'country'],
  ['France', 46.6, 2.4, 'country'],
  ['United Kingdom', 54.0, -2.5, 'country', 'UK', 'Britain', 'England', 'Scotland', 'Wales'],
  ['Ireland', 53.4, -8.0, 'country'],
  ['Spain', 40.2, -3.7, 'country'],
  ['Portugal', 39.6, -8.0, 'country'],
  ['Italy', 42.8, 12.6, 'country'],
  ['Greece', 39.0, 22.0, 'country'],
  ['Netherlands', 52.2, 5.5, 'country'],
  ['Belgium', 50.6, 4.6, 'country'],
  ['Serbia', 44.0, 21.0, 'country'],
  ['Georgia', 42.3, 43.4, 'country'],
  ['Armenia', 40.2, 45.0, 'country'],
  ['Azerbaijan', 40.3, 47.7, 'country'],
  ['Turkey', 39.0, 35.0, 'country', 'Türkiye', 'Turkiye'],
  ['Israel', 31.5, 34.9, 'country'],
  ['Palestine', 31.9, 35.2, 'country'],
  ['Lebanon', 33.9, 35.9, 'country'],
  ['Syria', 35.0, 38.5, 'country'],
  ['Iraq', 33.0, 43.7, 'country'],
  ['Iran', 32.4, 53.7, 'country'],
  ['Saudi Arabia', 24.0, 45.0, 'country'],
  ['Yemen', 15.6, 48.0, 'country'],
  ['Egypt', 26.8, 30.8, 'country'],
  ['Libya', 27.0, 17.0, 'country'],
  ['Sudan', 15.6, 30.0, 'country'],
  ['South Sudan', 7.0, 30.0, 'country'],
  ['Ethiopia', 9.1, 40.5, 'country'],
  ['Somalia', 5.2, 46.2, 'country'],
  ['Kenya', 0.0, 37.9, 'country'],
  ['Nigeria', 9.1, 8.7, 'country'],
  ['Mali', 17.6, -4.0, 'country'],
  ['Niger', 17.6, 8.1, 'country'],
  ['Burkina Faso', 12.2, -1.6, 'country'],
  ['Congo', -2.9, 23.7, 'country', 'DR Congo', 'DRC', 'Democratic Republic of the Congo', 'Democratic Republic of Congo', 'Congo-Kinshasa'],
  ['South Africa', -29.0, 25.0, 'country'],
  ['Morocco', 31.8, -7.1, 'country'],
  ['Tunisia', 34.0, 9.0, 'country'],
  ['Algeria', 28.0, 2.6, 'country'],
  ['India', 22.0, 79.0, 'country'],
  ['Pakistan', 30.4, 69.3, 'country'],
  ['Afghanistan', 33.9, 67.7, 'country'],
  ['Bangladesh', 23.7, 90.4, 'country'],
  ['Nepal', 28.4, 84.1, 'country'],
  ['Sri Lanka', 7.9, 80.8, 'country'],
  ['Myanmar', 21.9, 95.96, 'country', 'Burma'],
  ['Thailand', 15.9, 100.99, 'country'],
  ['Vietnam', 14.1, 108.3, 'country'],
  ['Indonesia', -2.5, 118.0, 'country'],
  ['Philippines', 12.9, 121.8, 'country'],
  ['Malaysia', 4.2, 102.0, 'country'],
  ['China', 35.9, 104.2, 'country'],
  ['Taiwan', 23.7, 121.0, 'country'],
  ['North Korea', 40.3, 127.5, 'country'],
  ['South Korea', 36.5, 127.9, 'country', 'Korea'],
  ['Japan', 36.2, 138.3, 'country'],
  ['Australia', -25.3, 133.8, 'country'],
  ['New Zealand', -41.0, 174.0, 'country'],
  ['United States', 39.8, -98.6, 'country', 'USA', 'US', 'U.S.', 'America'],
  ['Canada', 56.1, -106.3, 'country'],
  ['Mexico', 23.6, -102.5, 'country'],
  ['Cuba', 21.5, -77.8, 'country'],
  ['Haiti', 18.97, -72.3, 'country'],
  ['Venezuela', 6.4, -66.6, 'country'],
  ['Colombia', 4.6, -74.3, 'country'],
  ['Ecuador', -1.8, -78.2, 'country'],
  ['Peru', -9.2, -75.0, 'country'],
  ['Bolivia', -16.3, -63.6, 'country'],
  ['Chile', -35.7, -71.5, 'country'],
  ['Argentina', -38.4, -63.6, 'country'],
  ['Brazil', -14.2, -51.9, 'country'],
]

// --- Every other country, from Natural Earth polygons (world-atlas) ---
// Rows above keep their hand-picked centroids; anything missing (Uganda,
// Rwanda, ...) is added from the polygons with a cleaned-up name.

const NE_NAMES: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'Congo',
  Congo: 'Republic of the Congo',
  'S. Sudan': 'South Sudan',
  'Central African Rep.': 'Central African Republic',
  'Eq. Guinea': 'Equatorial Guinea',
  'Dominican Rep.': 'Dominican Republic',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'W. Sahara': 'Western Sahara',
  'Solomon Is.': 'Solomon Islands',
  'Marshall Is.': 'Marshall Islands',
  'Falkland Is.': 'Falkland Islands',
  'Fr. Polynesia': 'French Polynesia',
  'N. Cyprus': 'Northern Cyprus',
  "Côte d'Ivoire": 'Ivory Coast',
  eSwatini: 'Eswatini',
  Macedonia: 'North Macedonia',
  'Czechia': 'Czech Republic',
}
const NE_ALIASES: Record<string, string[]> = {
  'Ivory Coast': ["Côte d'Ivoire", "Cote d'Ivoire"],
  'Czech Republic': ['Czechia'],
  'Bosnia and Herzegovina': ['Bosnia'],
  'North Macedonia': ['Macedonia'],
  'Eswatini': ['Swaziland'],
  'Republic of the Congo': ['Congo-Brazzaville'],
  'Timor-Leste': ['East Timor'],
}

type Shape = { id: string; name: string; geo: GeoPermissibleObjects; box: [[number, number], [number, number]] }
const topo = countries50 as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
const SHAPES: Shape[] = feature(topo, topo.objects.countries).features.map((f) => {
  const name = f.properties.name
  return { id: String(f.id ?? name), name: NE_NAMES[name] ?? name, geo: f as GeoPermissibleObjects, box: geoBounds(f as GeoPermissibleObjects) }
})

const inBox = (s: Shape, lon: number, lat: number) => {
  const [[x0, y0], [x1, y1]] = s.box
  return lat >= y0 - 0.2 && lat <= y1 + 0.2 && (x0 <= x1 ? lon >= x0 - 0.2 && lon <= x1 + 0.2 : lon >= x0 - 0.2 || lon <= x1 + 0.2)
}
/** Country polygon containing a point; nudges a little for coastal cities that the 1:50m outline clips. */
function shapeAt(lat: number, lon: number): Shape | undefined {
  for (const [dx, dy] of [[0, 0], [0.08, 0], [-0.08, 0], [0, 0.08], [0, -0.08], [0.15, 0.15], [-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15]]) {
    const s = SHAPES.find((s) => inBox(s, lon + dx, lat + dy) && geoContains(s.geo, [lon + dx, lat + dy]))
    if (s) return s
  }
}

/** Largest polygon's centroid: France's pin belongs in Europe, not between Paris and Guiana. */
function mainCentroid(s: Shape): [number, number] {
  const g = (s.geo as unknown as { geometry: { type: string; coordinates: number[][][][] } }).geometry
  if (g.type !== 'MultiPolygon') return geoCentroid(s.geo)
  let best: number[][][] = g.coordinates[0]
  let area = -1
  for (const poly of g.coordinates) {
    const a = geoArea({ type: 'Polygon', coordinates: poly })
    if (a > area) [area, best] = [a, poly]
  }
  return geoCentroid({ type: 'Polygon', coordinates: best })
}

// Water bodies and straits belong to no country: they compete as their own location.
const NO_COUNTRY = new Set(['Strait of Hormuz', 'Bab el-Mandeb', 'Taiwan Strait', 'Suez Canal'])
// Where the 1:50m polygons disagree with how news names the place.
const PARENT: Record<string, string> = { Sevastopol: 'Ukraine', Crimea: 'Ukraine', Jerusalem: 'Israel', 'Hong Kong': 'China', Knesset: 'Israel' }

type Entry = { name: string; lat: number; lon: number; kind: Kind; country?: string; site: boolean }

// Polygon id -> hand-written country name ("Congo" row sits in the DRC polygon).
const handById = new Map<string, string>()
for (const [name, lat, lon, kind] of ROWS) {
  const s = kind === 'country' ? shapeAt(lat, lon) : undefined
  if (s && !handById.has(s.id)) handById.set(s.id, name)
}

const LOCS: Entry[] = []
{
  let site = false
  for (const [name, lat, lon, kind] of ROWS) {
    if (name === 'Plaza de Cibeles') site = true // rows from the "sites" block on are specific spots
    if (kind === 'country') site = false
    const shape = kind === 'country' || NO_COUNTRY.has(name) ? undefined : shapeAt(lat, lon)
    const country = kind === 'country' ? name : (PARENT[name] ?? (shape ? (handById.get(shape.id) ?? shape.name) : undefined))
    LOCS.push({ name, lat, lon, kind, country, site: site && kind === 'place' })
  }
}

const autoRows: Row[] = []
for (const s of SHAPES) {
  if (handById.has(s.id) || LOCS.some((l) => l.name === s.name) || /Antarctic|Ter\.|I\. and|Is\.$|Siachen/.test(s.name)) continue
  const [lon, lat] = mainCentroid(s)
  const row: Row = [s.name, Math.round(lat * 100) / 100, Math.round(lon * 100) / 100, 'country', ...(NE_ALIASES[s.name] ?? [])]
  autoRows.push(row)
  LOCS.push({ name: s.name, lat: row[1], lon: row[2], kind: 'country', country: s.name, site: false })
}

// --- Demonyms: "Ugandan police", "French files". Capitalised, matched case-sensitively, weigh less than names. ---
// Ambiguous ones are left out on purpose (Congolese, Korean, Guinean, Georgian).
const DEMONYMS: Record<string, string[]> = {
  Ukraine: ['Ukrainian', 'Ukrainians'], Russia: ['Russian', 'Russians'], Belarus: ['Belarusian'], Poland: ['Polish', 'Poles'],
  Germany: ['German', 'Germans'], France: ['French'], 'United Kingdom': ['British', 'Briton', 'Britons'], Ireland: ['Irish'],
  Spain: ['Spanish', 'Spaniards'], Portugal: ['Portuguese'], Italy: ['Italian', 'Italians'], Greece: ['Greek', 'Greeks'],
  Netherlands: ['Dutch'], Belgium: ['Belgian'], Serbia: ['Serbian', 'Serbs'], Armenia: ['Armenian', 'Armenians'],
  Azerbaijan: ['Azerbaijani', 'Azeri'], Turkey: ['Turkish', 'Turks'], Israel: ['Israeli', 'Israelis'],
  Palestine: ['Palestinian', 'Palestinians'], Lebanon: ['Lebanese'], Syria: ['Syrian', 'Syrians'], Iraq: ['Iraqi', 'Iraqis'],
  Iran: ['Iranian', 'Iranians'], 'Saudi Arabia': ['Saudi', 'Saudis'], Yemen: ['Yemeni', 'Yemenis', 'Houthi', 'Houthis'],
  Egypt: ['Egyptian', 'Egyptians'], Libya: ['Libyan', 'Libyans'], Sudan: ['Sudanese'], 'South Sudan': ['South Sudanese'],
  Ethiopia: ['Ethiopian', 'Ethiopians'], Somalia: ['Somali', 'Somalis'], Kenya: ['Kenyan', 'Kenyans'],
  Nigeria: ['Nigerian', 'Nigerians'], Mali: ['Malian'], Niger: ['Nigerien'], 'Burkina Faso': ['Burkinabe'],
  'South Africa': ['South African', 'South Africans'], Morocco: ['Moroccan', 'Moroccans'], Tunisia: ['Tunisian'],
  Algeria: ['Algerian', 'Algerians'], India: ['Indian', 'Indians'], Pakistan: ['Pakistani', 'Pakistanis'],
  Afghanistan: ['Afghan', 'Afghans', 'Taliban'], Bangladesh: ['Bangladeshi'], Nepal: ['Nepali', 'Nepalese'],
  'Sri Lanka': ['Sri Lankan'], Myanmar: ['Burmese'], Thailand: ['Thai'], Vietnam: ['Vietnamese'],
  Indonesia: ['Indonesian', 'Indonesians'], Philippines: ['Filipino', 'Filipinos', 'Philippine'], Malaysia: ['Malaysian'],
  China: ['Chinese'], Taiwan: ['Taiwanese'], 'North Korea': ['North Korean', 'North Koreans'],
  'South Korea': ['South Korean', 'South Koreans'], Japan: ['Japanese'], Australia: ['Australian', 'Australians'],
  'New Zealand': ['New Zealander'], 'United States': ['American', 'Americans'], Canada: ['Canadian', 'Canadians'],
  Mexico: ['Mexican', 'Mexicans'], Cuba: ['Cuban', 'Cubans'], Haiti: ['Haitian', 'Haitians'],
  Venezuela: ['Venezuelan', 'Venezuelans'], Colombia: ['Colombian', 'Colombians'], Ecuador: ['Ecuadorian'],
  Peru: ['Peruvian', 'Peruvians'], Bolivia: ['Bolivian'], Chile: ['Chilean', 'Chileans'],
  Argentina: ['Argentine', 'Argentinian'], Brazil: ['Brazilian', 'Brazilians'], Uganda: ['Ugandan', 'Ugandans'],
  Rwanda: ['Rwandan', 'Rwandans'], Tanzania: ['Tanzanian'], Ghana: ['Ghanaian'], Senegal: ['Senegalese'],
  Cameroon: ['Cameroonian'], Chad: ['Chadian'], Zimbabwe: ['Zimbabwean'], Mozambique: ['Mozambican'],
  Angola: ['Angolan'], Eritrea: ['Eritrean'], Hungary: ['Hungarian'], Romania: ['Romanian', 'Romanians'],
  Bulgaria: ['Bulgarian'], Moldova: ['Moldovan'], Lithuania: ['Lithuanian'], Latvia: ['Latvian'], Estonia: ['Estonian'],
  Finland: ['Finnish'], Sweden: ['Swedish'], Norway: ['Norwegian'], Denmark: ['Danish'], Austria: ['Austrian'],
  Switzerland: ['Swiss'], 'Czech Republic': ['Czech'], Slovakia: ['Slovak'], Croatia: ['Croatian'],
  Kazakhstan: ['Kazakh'], Uzbekistan: ['Uzbek'], Kyrgyzstan: ['Kyrgyz'], Tajikistan: ['Tajik'], Mongolia: ['Mongolian'],
  Jordan: ['Jordanian'], Kuwait: ['Kuwaiti'], Qatar: ['Qatari'], 'United Arab Emirates': ['Emirati'], Oman: ['Omani'],
  Bahrain: ['Bahraini'], Nicaragua: ['Nicaraguan'], Guatemala: ['Guatemalan'], Honduras: ['Honduran'],
  'El Salvador': ['Salvadoran'], Panama: ['Panamanian'], Paraguay: ['Paraguayan'], Uruguay: ['Uruguayan'],
}

// Phrases that contain a place name but are not about that place: outlets, sports, other territories.
const EXCLUSIONS = [
  'France 24', 'France24', 'Radio France', 'France Info', 'France Télévisions', 'Agence France-Presse', 'Agence France Presse',
  'Paris-based', 'Paris based', 'Paris Agreement', 'Paris climate', 'Paris Saint-Germain', 'Paris St-Germain', 'Paris Club',
  'London-based', 'London based', 'Washington-based', 'Washington based', 'New York-based', 'New York Times', 'Washington Post',
  'Doha-based', 'Dubai-based', 'Brussels-based', 'Geneva-based', 'Berlin-based', 'Moscow-based', 'Tehran-based',
  'Al Jazeera', 'Voice of America', 'Radio Free Europe', 'Deutsche Welle', 'BBC', 'Sky News', 'Russia Today', 'China Daily',
  'Times of India', 'Times of Israel', 'Jerusalem Post', 'Kyiv Independent', 'Kyiv Post', 'Moscow Times', 'Tehran Times',
  'South China Morning Post', 'Japan Times', 'Korea Herald', 'Hong Kong Free Press', 'Iran International',
  'French Open', 'French Polynesia', 'French Guiana', 'British Columbia', 'British Virgin Islands', 'Northern Ireland',
  'New Mexico', 'Indian Ocean', 'Indian Premier League', 'American Samoa', 'Latin American', 'South American',
  'Turks and Caicos', 'Papua New Guinea', 'Guinea-Bissau', 'Equatorial Guinea', 'Georgia Tech', 'Jordan Bardella',
  'Michael Jordan', 'Paris Hilton', 'Chad Smith', 'Washington Commanders', 'Real Madrid', 'Atletico Madrid',
  'Manchester United', 'Manchester City', 'Inter Milan', 'AC Milan',
]

export type GeoHit = {
  name: string
  lat: number
  lon: number
  kind: Kind
  /** Country the hit belongs to (its own name for a country hit), when known. */
  country?: string
}

export type GeoResult = GeoHit & {
  /** Share of all location evidence that points to the winning country (0..1). */
  confidence: number
  /** How many documents name the winning country (directly or through a place in it). */
  docs: number
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type Matcher = { loc: Entry; weight: number }
const locByName = new Map(LOCS.map((l) => [l.name, l]))
// Short all-caps aliases (UK, LA, US) and demonyms match case-sensitively to avoid noise; the rest ignore case.
const exact = new Map<string, Matcher>()
const folded = new Map<string, Matcher>()
for (const [name, , , , ...aliases] of [...ROWS, ...autoRows]) {
  const loc = locByName.get(name)!
  for (const alias of [name, ...aliases]) {
    if (alias.length <= 3) exact.set(alias, { loc, weight: 1 })
    else if (!folded.has(alias.toLowerCase())) folded.set(alias.toLowerCase(), { loc, weight: 1 })
  }
}
for (const [country, words] of Object.entries(DEMONYMS)) {
  const loc = locByName.get(country)
  if (loc) for (const w of words) exact.set(w, { loc, weight: 0.6 })
}
// One alternation per case mode, longest first: at any position the longest alias wins,
// so "South Sudan" is consumed before "Sudan" can match inside it.
const alternation = (words: string[], flags: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.sort((x, y) => y.length - x.length).map(escape).join('|')})(?![\\p{L}\\p{N}])`, flags)
const EXACT_RE = alternation([...exact.keys()], 'gu')
const FOLDED_RE = alternation([...folded.keys()], 'giu')
const EXCLUDE_RE = alternation(EXCLUSIONS, 'giu')

const blank = (s: string) => ' '.repeat(s.length)

// --- Native-script names for channels that post in Ukrainian, Russian, Arabic or Persian. ---
// Regex fragments: Slavic case endings and Arabic prefixes (و ب ل ف, ال) vary, so stems take a short tail.
const T = '[\\p{L}]{0,4}'
const AR = '(?:[وبلف]?(?:ال)?)'
const NATIVE: [string, ...string[]][] = [
  ['Kyiv', `київ${T}`, `киев${T}`, `києв${T}`],
  ['Kharkiv', `харків${T}`, `харков${T}`, `харьков${T}`],
  ['Odesa', `одес${T}`],
  ['Dnipro', `дніпр${T}`, `днепр${T}`, `дніпропетровщин${T}`],
  ['Zaporizhzhia', `запоріж${T}`, `запорож${T}`],
  ['Donetsk', `донецьк${T}`, `донецк${T}`, `донеччин${T}`],
  ['Luhansk', `луганськ${T}`, `луганск${T}`, `луганщин${T}`],
  ['Kherson', `херсон${T}`],
  ['Mykolaiv', `миколаїв${T}`, `миколаєв${T}`, `николаев${T}`],
  ['Sumy', `сум(?:и|ах|ам|щин${T})`, 'сумы'],
  ['Chernihiv', `чернігів${T}`, `чернігов${T}`, `чернігівщин${T}`, `чернигов${T}`],
  ['Poltava', `полтав${T}`],
  ['Lviv', `львів${T}`, `львов${T}`, `льв(?:ові|ова)`],
  ['Kropyvnytskyi', `кіровоградщин${T}`, `кропивницьк${T}`],
  ['Kryvyi Rih', 'кривий ріг', 'кривому розі', 'кривого рогу', 'кривой рог'],
  ['Pokrovsk', `покровськ${T}`, `покровск${T}`],
  ['Kramatorsk', `краматорськ${T}`, `краматорск${T}`],
  ['Sloviansk', `слов.янськ${T}`, `славянск${T}`],
  ['Kostiantynivka', `костянтинівк${T}`, `константиновк${T}`],
  ['Zhytomyr', `житомир${T}`],
  ['Vinnytsia', `вінниц${T}`, `вінничин${T}`],
  ['Cherkasy', `черкас${T}`, `черкащин${T}`],
  ['Rivne', `рівн(?:е|ому|енщин${T})`],
  ['Crimea', `крим${T}`, `крым${T}`],
  ['Sevastopol', `севастопол${T}`],
  ['Moscow', `москв${T}`, `підмосков${T}`, `подмосков${T}`],
  ['Belgorod', `белгород${T}`, `бєлгород${T}`],
  ['Kursk', `курськ${T}`, `курск${T}`],
  ['Bryansk', `брянськ${T}`, `брянск${T}`],
  ['Voronezh', `воронеж${T}`],
  ['Rostov-on-Don', `ростов${T}`],
  ['Krasnodar', `краснодар${T}`],
  ['Novorossiysk', `новоросійськ${T}`, `новороссийск${T}`],
  ['Ukraine', 'україна', 'україни', 'україні', 'україну', 'украина', 'украины', 'украине', 'украину'],
  ['Russia', 'росія', 'росії', 'росію', 'россия', 'россии', 'россию'],
  ['Belarus', `білорус(?:ь|і)`, `беларус(?:ь|и)`],
  ['Gaza', `${AR}غز[ةه]`, 'עזה'],
  ['Beirut', `${AR}بيروت`],
  ['Lebanon', `${AR}لبنان`],
  ['Tyre', `${AR}صور`],
  ['Damascus', `${AR}دمشق`],
  ['Syria', `${AR}سوري[اة]`],
  ['Tehran', `${AR}(?:طهران|تهران)`],
  ['Iran', `${AR}(?:إيران|ايران|ایران)`],
  ['Baghdad', `${AR}بغداد`],
  ['Iraq', `${AR}عراق`],
  ['Yemen', `${AR}يمن`],
  ['Sanaa', `${AR}صنعاء`],
  ['Israel', `${AR}(?:إسرائيل|اسرائيل)`, 'ישראל'],
  ['West Bank', `${AR}ضف[ةه] ال?غربي[ةه]`],
  ['Jerusalem', `${AR}قدس`, 'ירושלים'],
  ['Tel Aviv', 'تل أبيب', 'تل ابيب', 'תל אביב'],
  ['Haifa', `${AR}حيفا`, 'חיפה'],
  ['Saudi Arabia', `${AR}سعودي[ةه]`],
]
const nativeFrags: { re: RegExp; loc: Entry; frag: string }[] = NATIVE.flatMap(([name, ...frags]) => {
  const loc = locByName.get(name)
  if (!loc) throw new Error(`gazetteer: native alias for unknown place ${name}`)
  return frags.map((frag) => ({ frag, loc, re: new RegExp(`^(?:${frag})$`, 'iu') }))
})
const NATIVE_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${nativeFrags.map((f) => f.frag).join('|')})(?![\\p{L}\\p{N}])`, 'giu')

type Hit = { at: number; len: number; m: Matcher }
function mentions(text: string): Hit[] {
  // "Kuwait-born", "Iranian-backed": origin or sponsor, not where it happens.
  const work = text.replace(EXCLUDE_RE, blank).replace(/[\p{L}.]+-(?:born|backed|based|made|led|funded|linked|flagged)(?![\p{L}])/gu, blank)
  const hits: Hit[] = []
  for (const r of work.matchAll(FOLDED_RE)) hits.push({ at: r.index, len: r[0].length, m: folded.get(r[0].toLowerCase())! })
  for (const r of work.matchAll(EXACT_RE)) hits.push({ at: r.index, len: r[0].length, m: exact.get(r[0])! })
  if (/[\u0400-\u04ff\u0590-\u06ff]/.test(work))
    for (const r of work.matchAll(NATIVE_RE)) {
      const f = nativeFrags.find((x) => x.re.test(r[0]))
      if (f) hits.push({ at: r.index, len: r[0].length, m: { loc: f.loc, weight: 1 } })
    }
  hits.sort((x, y) => x.at - y.at || y.len - x.len)
  const out: Hit[] = []
  let end = -1
  for (const h of hits) {
    if (h.at < end) continue // inside a longer match
    out.push(h)
    end = h.at + h.len
  }
  return out
}

export type GeoDoc = { text: string | undefined; weight?: number }

/**
 * Where a set of documents is about. Every mention is evidence for its country
 * (a city counts for the country it is in), weighted by the document's weight,
 * by how early it appears, and by repetition; the best-supported country wins,
 * then its best-supported place is returned (or the country centroid).
 * Outlet names ("France 24", "Paris-based"), sports clubs and similar phrases
 * are masked first, and a longer alias masks the shorter ones inside it.
 */
export function scoreLocations(docs: GeoDoc[], opts: { avoid?: string[] } = {}): GeoResult | null {
  const country = new Map<string, { score: number; docs: number }>()
  const place = new Map<string, number>()
  let total = 0
  for (const { text, weight = 1 } of docs) {
    if (!text) continue
    const seenHere = new Map<string, number>()
    const countriesHere = new Set<string>()
    for (const { at, m } of mentions(text)) {
      const key = m.loc.country ?? m.loc.name
      const n = seenHere.get(m.loc.name) ?? 0
      seenHere.set(m.loc.name, n + 1)
      const early = 1 + 0.5 * (1 - at / Math.max(1, text.length))
      let pts = weight * m.weight * early * (n === 0 ? 1 : 0.3)
      if (opts.avoid?.includes(key)) pts *= 0.2
      const c = country.get(key) ?? { score: 0, docs: 0 }
      c.score += pts
      if (!countriesHere.has(key)) {
        countriesHere.add(key)
        c.docs++
      }
      country.set(key, c)
      if (m.loc.kind === 'place') place.set(m.loc.name, (place.get(m.loc.name) ?? 0) + pts * (m.loc.site ? 1.2 : 1))
      total += pts
    }
  }
  if (!total) return null
  const [key, best] = [...country.entries()].sort((a, b) => b[1].score - a[1].score)[0]
  const inside = [...place.entries()].filter(([n]) => (locByName.get(n)!.country ?? n) === key).sort((a, b) => b[1] - a[1])[0]
  const loc = inside ? locByName.get(inside[0])! : locByName.get(key)!
  return { name: loc.name, lat: loc.lat, lon: loc.lon, kind: loc.kind, country: loc.country, confidence: best.score / total, docs: best.docs }
}

/** Best location for free text; the first text weighs most (usually a title). */
export function geolocate(...texts: (string | undefined)[]): GeoHit | null {
  return geolocateAvoiding([], ...texts)
}

/**
 * Like `geolocate`, but discounts the named countries so something else wins when present.
 * "Will the U.S. invade Iran?" is about Iran, not the United States.
 */
export function geolocateAvoiding(avoid: string[], ...texts: (string | undefined)[]): GeoHit | null {
  const r = scoreLocations(texts.map((text, i) => ({ text, weight: i === 0 ? 2 : 1 })), { avoid })
  return r && { name: r.name, lat: r.lat, lon: r.lon, kind: r.kind, country: r.country }
}

/** Country a known location belongs to (for clustering vetoes and filters). */
export const countryOf = (name: string): string | undefined => locByName.get(name)?.country

/** Country (gazetteer name) whose polygon contains a point, if any. */
// Runtime lookups (every live item, every few minutes) use the 1:110m outlines: ~7x fewer points than
// the 1:50m ones used once at start-up to assign places, and plenty for "which country is this in".
const topo110 = countries110 as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
const SHAPES110: Shape[] = feature(topo110, topo110.objects.countries).features.map((f) => {
  const name = f.properties.name
  return { id: String(f.id ?? name), name: NE_NAMES[name] ?? name, geo: f as GeoPermissibleObjects, box: geoBounds(f as GeoPermissibleObjects) }
})
function shapeAt110(lat: number, lon: number): Shape | undefined {
  for (const [dx, dy] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
    const s = SHAPES110.find((s) => inBox(s, lon + dx, lat + dy) && geoContains(s.geo, [lon + dx, lat + dy]))
    if (s) return s
  }
}

const atCache = new Map<string, string | undefined>()
/** Country containing a point (cached on a ~1 km grid: ships, aircraft and repeated pins hit the cache). */
export function countryAt(lat: number, lon: number): string | undefined {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`
  if (!atCache.has(k)) {
    const s = shapeAt110(lat, lon)
    if (atCache.size > 100_000) atCache.clear()
    atCache.set(k, s && (handById.get(s.id) ?? s.name))
  }
  return atCache.get(k)
}

/** Gazetteer name for a Natural Earth polygon id (same ids at every world-atlas resolution). */
export const countryNameForId = (id: string, neName: string): string => handById.get(id) ?? NE_NAMES[neName] ?? neName

/** Pin position for a country name. */
export function centroidOf(name: string): { lat: number; lon: number } | undefined {
  const l = locByName.get(name)
  return l && { lat: l.lat, lon: l.lon }
}

/** Places and countries whose name or alias matches a query (prefix matches first), for the search box. */
export function searchPlaces(q: string, limit = 6): { name: string; lat: number; lon: number; kind: Kind; country?: string }[] {
  const s = q.trim().toLowerCase()
  if (s.length < 2) return []
  const seen = new Set<string>()
  const out: { score: number; e: (typeof LOCS)[number] }[] = []
  for (const [name, , , , ...aliases] of [...ROWS, ...autoRows]) {
    const loc = locByName.get(name)
    if (!loc || seen.has(name)) continue
    const hit = [name, ...aliases].map((a) => a.toLowerCase()).reduce((best, a) => Math.max(best, a === s ? 3 : a.startsWith(s) ? 2 : a.includes(s) ? 1 : 0), 0)
    if (hit) {
      seen.add(name)
      out.push({ score: hit + (loc.kind === 'country' ? 0.5 : 0), e: loc })
    }
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e }) => ({ name: e.name, lat: e.lat, lon: e.lon, kind: e.kind, country: e.country }))
}
