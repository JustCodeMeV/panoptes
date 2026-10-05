/** Map presets: one click sets the layers that answer a kind of question. */
export const PRESETS: { id: string; label: string; hint: string; layers: string[] }[] = [
  { id: 'conflict', label: 'Conflict', hint: 'Fighting, front lines, warnings, military aircraft', layers: ['events', 'frontlines', 'acled', 'unrest', 'warnings', 'military-air', 'cii'] },
  { id: 'info', label: 'Information ops', hint: 'Coordinated stories, narratives, official statements, Telegram', layers: ['campaigns', 'narratives', 'news', 'telegram', 'statements', 'x', 'trends'] },
  { id: 'cyber', label: 'Cyber', hint: 'Ransomware, botnets, outages, censorship, GPS jamming, cables', layers: ['cyber', 'osint', 'gnss', 'infrastructure'] },
  { id: 'humanitarian', label: 'Humanitarian', hint: 'Disasters, outbreaks, unrest, instability', layers: ['humanitarian', 'hazards', 'unrest', 'cii'] },
  { id: 'markets', label: 'Markets', hint: 'Prediction markets and world markets', layers: ['markets', 'finance', 'cii'] },
]
