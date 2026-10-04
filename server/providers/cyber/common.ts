import { centroidOf } from '../../geo/gazetteer.ts'

const names = new Intl.DisplayNames(['en'], { type: 'region' })
const FIX: Record<string, string> = { 'United States': 'United States', 'Congo - Kinshasa': 'Congo', 'Congo - Brazzaville': 'Republic of the Congo', 'Myanmar (Burma)': 'Myanmar', 'Czechia': 'Czech Republic', 'Hong Kong SAR China': 'Hong Kong', 'Palestinian Territories': 'Palestine', 'Türkiye': 'Turkey' }

/** ISO 3166 alpha-2 -> gazetteer country name and centroid (undefined for unknown/empty codes). */
export function countryOfCode(code: string | undefined): { name: string; lat: number; lon: number } | undefined {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return undefined
  let n: string | undefined
  try {
    n = names.of(code.toUpperCase())
  } catch {
    return undefined
  }
  if (!n) return undefined
  const name = FIX[n] ?? n
  const c = centroidOf(name)
  return c && { name, ...c }
}

/** Small deterministic offset so several items in one country do not stack on one pixel. */
export const jitter = (key: string, spread = 1.2) => {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0
  return { dLat: (((h & 0xff) / 255) - 0.5) * spread, dLon: ((((h >> 8) & 0xff) / 255) - 0.5) * spread }
}
