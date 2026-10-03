/**
 * Public Telegram channels the scouts read through the keyless web preview
 * (https://t.me/s/<handle>). Handles are public facts; the classification is
 * ours and editable: it says what kind of source a channel is, not whether a
 * given post is true.
 *
 *  tier  1 official body · 2 established newsroom / reputable OSINT · 3 aggregator · 4 partisan / unvetted
 *  type  gov · media · osint · state (state-affiliated) · milblog (partisan war blogger)
 *  bloc  state alignment, for coordinated-amplification flags (RU, IR, CN, ...)
 *  region  gazetteer name used as the location when a post names no place
 */
export type ChannelType = 'gov' | 'media' | 'osint' | 'state' | 'milblog'
export type Channel = {
  handle: string
  name: string
  tier: 1 | 2 | 3 | 4
  type: ChannelType
  topic: 'conflict' | 'middleeast' | 'ukraine' | 'breaking' | 'geopolitics' | 'cyber' | 'osint'
  bloc?: string
  region?: string
  /** Found by the scouts through forwards/mentions rather than curated. */
  discovered?: boolean
}

const c = (handle: string, name: string, tier: Channel['tier'], type: ChannelType, topic: Channel['topic'], region?: string, bloc?: string): Channel => ({
  handle, name, tier, type, topic, ...(region ? { region } : {}), ...(bloc ? { bloc } : {}),
})

export const CHANNELS: Channel[] = [
  // --- official bodies: first word on alerts and strikes, but parties to the conflict ---
  c('dsns_telegram', 'Ukraine State Emergency Service', 1, 'gov', 'ukraine', 'Ukraine', 'UA'),
  c('kpszsu', 'Ukrainian Air Force', 1, 'gov', 'ukraine', 'Ukraine', 'UA'),
  c('PikudHaOref_all', 'Israel Home Front Command', 1, 'gov', 'middleeast', 'Israel', 'IL'),
  c('IDFofficial', 'IDF', 1, 'gov', 'middleeast', 'Israel', 'IL'),
  c('RocketAlert', 'Rocket Alert', 1, 'gov', 'middleeast', 'Israel'),
  c('SaudiDCD', 'Saudi Civil Defense', 1, 'gov', 'middleeast', 'Saudi Arabia', 'SA'),
  c('InaTEWS_BMKG', 'BMKG InaTEWS (Indonesia)', 1, 'gov', 'breaking', 'Indonesia'),
  c('mod_russia_en', 'Russian MoD (EN)', 1, 'state', 'ukraine', 'Russia', 'RU'),
  c('MFARussia', 'Russian MFA', 1, 'state', 'geopolitics', 'Russia', 'RU'),
  // --- newsrooms ---
  c('cnalatest', 'CNA', 2, 'media', 'geopolitics', 'Singapore'),
  c('france24_en', 'France 24', 2, 'media', 'geopolitics'),
  c('MiddleEastEye_TG', 'Middle East Eye', 2, 'media', 'middleeast'),
  c('kyivindependent_official', 'Kyiv Independent', 2, 'media', 'ukraine', 'Ukraine'),
  c('ukrpravda_news', 'Ukrainska Pravda', 2, 'media', 'ukraine', 'Ukraine'),
  c('meduzalive', 'Meduza', 2, 'media', 'geopolitics', 'Russia'),
  c('nexta_tv', 'NEXTA', 3, 'media', 'geopolitics', 'Belarus'),
  c('nexta_live', 'NEXTA Live', 3, 'media', 'geopolitics', 'Belarus'),
  c('wamnews_en', 'WAM (UAE)', 2, 'state', 'middleeast', 'United Arab Emirates', 'AE'),
  // --- state-affiliated outlets ---
  c('tass_agency', 'TASS', 2, 'state', 'geopolitics', 'Russia', 'RU'),
  c('PressTV', 'Press TV', 2, 'state', 'geopolitics', 'Iran', 'IR'),
  c('defapress_ir', 'DefaPress (Iran MoD)', 2, 'state', 'conflict', 'Iran', 'IR'),
  c('SaberinFa', 'Saberin (IRGC-aligned)', 3, 'state', 'conflict', 'Iran', 'IR'),
  // --- OSINT and aggregators ---
  c('ClashReport', 'Clash Report', 3, 'osint', 'conflict'),
  c('OSINTdefender', 'OSINTdefender', 3, 'osint', 'conflict'),
  c('DeepStateUA', 'DeepState', 2, 'osint', 'ukraine', 'Ukraine'),
  c('LiveUAMap', 'Liveuamap', 2, 'osint', 'breaking'),
  c('rnintel', 'RN Intel', 3, 'osint', 'osint'),
  c('DefenderDome', 'The Defender Dome', 3, 'osint', 'conflict'),
  c('warfareanalysis', 'Warfare Analysis', 3, 'osint', 'conflict'),
  c('wfwitness', 'Witness', 3, 'osint', 'breaking'),
  c('faytuks', 'Faytuks News', 3, 'osint', 'breaking'),
  c('wartranslated', 'WarTranslated', 3, 'osint', 'ukraine', 'Ukraine'),
  c('vxunderground', 'vx-underground', 3, 'osint', 'cyber'),
  c('thehackernews', 'The Hacker News', 2, 'media', 'cyber'),
  c('Middle_East_Spectator', 'Middle East Spectator', 4, 'osint', 'middleeast'),
  c('abualiexpress', 'Abu Ali Express', 3, 'milblog', 'middleeast', 'Israel'),
  c('englishabuali', 'Abu Ali Express (EN)', 3, 'milblog', 'middleeast', 'Israel'),
  c('israelwarroom', 'Israel War Room', 4, 'milblog', 'middleeast', 'Israel'),
  c('LebUpdate', 'Lebanon Update', 4, 'osint', 'middleeast', 'Lebanon'),
  c('VahidOnline', 'Vahid Online', 3, 'osint', 'geopolitics', 'Iran'),
  c('disclosetv', 'Disclose.tv', 4, 'osint', 'breaking'),
  // --- partisan war bloggers and aligned networks: where coordinated narratives often start ---
  c('intelslava', 'Intel Slava Z', 4, 'milblog', 'ukraine', 'Russia', 'RU'),
  c('rybar', 'Rybar', 4, 'milblog', 'ukraine', 'Russia', 'RU'),
  c('rybar_in_english', 'Rybar (EN)', 4, 'milblog', 'ukraine', 'Russia', 'RU'),
  c('wargonzo', 'WarGonzo', 4, 'milblog', 'ukraine', 'Russia', 'RU'),
  c('dva_majors', 'Two Majors', 4, 'milblog', 'ukraine', 'Russia', 'RU'),
  c('readovkanews', 'Readovka', 4, 'milblog', 'geopolitics', 'Russia', 'RU'),
  c('SolovievLive', 'Soloviev Live', 4, 'state', 'geopolitics', 'Russia', 'RU'),
  c('militarysummary', 'Military Summary', 4, 'milblog', 'ukraine'),
  c('ukrainenow', 'Ukraine NOW', 3, 'media', 'ukraine', 'Ukraine'),
  c('operativnoZSU', 'Operativno ZSU', 4, 'milblog', 'ukraine', 'Ukraine', 'UA'),
  c('Tsaplienko', 'Tsaplienko', 3, 'milblog', 'ukraine', 'Ukraine'),
  c('thecradlemedia', 'The Cradle', 4, 'media', 'middleeast'),
  c('QudsNen', 'Quds News Network', 4, 'media', 'middleeast', 'Palestine'),
  c('FotrosResistancee', 'Fotros Resistance', 4, 'milblog', 'conflict', 'Iran', 'IR'),
  c('bintjbeilnews', 'Bint Jbeil News', 4, 'media', 'middleeast', 'Lebanon'),
  c('Alsaa_plus_EN', 'Al-Saa (EN)', 4, 'media', 'middleeast'),
  c('GeoPWatch', 'GeoPol Watch', 4, 'osint', 'geopolitics'),
  c('DDGeopolitics', 'DD Geopolitics', 4, 'osint', 'geopolitics'),
  c('geopolitics_prime', 'Geopolitics Prime', 4, 'osint', 'geopolitics'),
]

export const TOPICS = ['conflict', 'ukraine', 'middleeast', 'breaking', 'geopolitics', 'cyber', 'osint'] as const
