/** Languages the translator reports (ISO 639-1), shown as a flag and three-letter code. */
const LANGS: Record<string, { name: string; code: string; flag: string }> = {
  ru: { name: 'Russian', code: 'RUS', flag: '🇷🇺' },
  uk: { name: 'Ukrainian', code: 'UKR', flag: '🇺🇦' },
  be: { name: 'Belarusian', code: 'BEL', flag: '🇧🇾' },
  ar: { name: 'Arabic', code: 'ARA', flag: '🇸🇦' },
  fa: { name: 'Persian', code: 'FAS', flag: '🇮🇷' },
  he: { name: 'Hebrew', code: 'HEB', flag: '🇮🇱' },
  iw: { name: 'Hebrew', code: 'HEB', flag: '🇮🇱' },
  tr: { name: 'Turkish', code: 'TUR', flag: '🇹🇷' },
  zh: { name: 'Chinese', code: 'ZHO', flag: '🇨🇳' },
  'zh-CN': { name: 'Chinese', code: 'ZHO', flag: '🇨🇳' },
  'zh-TW': { name: 'Chinese', code: 'ZHO', flag: '🇹🇼' },
  ja: { name: 'Japanese', code: 'JPN', flag: '🇯🇵' },
  ko: { name: 'Korean', code: 'KOR', flag: '🇰🇷' },
  hi: { name: 'Hindi', code: 'HIN', flag: '🇮🇳' },
  ur: { name: 'Urdu', code: 'URD', flag: '🇵🇰' },
  de: { name: 'German', code: 'DEU', flag: '🇩🇪' },
  fr: { name: 'French', code: 'FRA', flag: '🇫🇷' },
  es: { name: 'Spanish', code: 'SPA', flag: '🇪🇸' },
  pt: { name: 'Portuguese', code: 'POR', flag: '🇵🇹' },
  it: { name: 'Italian', code: 'ITA', flag: '🇮🇹' },
  pl: { name: 'Polish', code: 'POL', flag: '🇵🇱' },
  nl: { name: 'Dutch', code: 'NLD', flag: '🇳🇱' },
  el: { name: 'Greek', code: 'ELL', flag: '🇬🇷' },
  ka: { name: 'Georgian', code: 'KAT', flag: '🇬🇪' },
  hy: { name: 'Armenian', code: 'HYE', flag: '🇦🇲' },
  sr: { name: 'Serbian', code: 'SRP', flag: '🇷🇸' },
  ro: { name: 'Romanian', code: 'RON', flag: '🇷🇴' },
  id: { name: 'Indonesian', code: 'IND', flag: '🇮🇩' },
  th: { name: 'Thai', code: 'THA', flag: '🇹🇭' },
  vi: { name: 'Vietnamese', code: 'VIE', flag: '🇻🇳' },
}

export function language(code: string) {
  return LANGS[code] ?? LANGS[code.split('-')[0]] ?? { name: code.toUpperCase(), code: code.toUpperCase().slice(0, 3), flag: '🌐' }
}

/** Translated features carry the original and its language (server/core/translate.ts). */
export function translatedFrom(props: Record<string, unknown>): ReturnType<typeof language> | null {
  return props.original && typeof props.lang === 'string' ? language(props.lang) : null
}

/** "[SRC: 🇷🇺 RUS]" for a translated feature, else empty. */
export function srcTag(props: Record<string, unknown>): string {
  const l = translatedFrom(props)
  return l ? `[SRC: ${l.flag} ${l.code}]` : ''
}
