/**
 * Countries whose Google Trends "trending now" feed we read. Pure data, no imports: the relay script
 * (scripts/trends-relay.ts, run by GitHub Actions) imports it with plain Node.
 */

/** Search-trends layer: ISO 3166 code -> gazetteer country name. */
export const LAYER_GEOS: Record<string, string> = {
  UA: 'Ukraine', RU: 'Russia', BY: 'Belarus', PL: 'Poland', MD: 'Moldova', GE: 'Georgia', TR: 'Turkey', IL: 'Israel',
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', EG: 'Egypt', IQ: 'Iraq', LB: 'Lebanon', NG: 'Nigeria', KE: 'Kenya',
  ZA: 'South Africa', ET: 'Ethiopia', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', ID: 'Indonesia', PH: 'Philippines',
  TW: 'Taiwan', KR: 'South Korea', US: 'United States', MX: 'Mexico', BR: 'Brazil', VE: 'Venezuela', FR: 'France', GB: 'United Kingdom',
}

/** Truth sensor: English-language regions give the topic gate and fact-check matcher usable text. */
export const TRUTH_GEOS = ['US', 'GB', 'IN', 'AU', 'CA', 'IE', 'ZA', 'NG', 'KE', 'PH', 'SG', 'PK']

export const ALL_GEOS = [...new Set([...Object.keys(LAYER_GEOS), ...TRUTH_GEOS])]
