import { geolocateAvoiding } from '../geo/gazetteer.ts'

/**
 * Which prediction markets matter to a security/unrest picture. Prediction
 * platforms are full of sport, celebrity and finance; keep this list tight and
 * editable. Elections only count outside the US (US politics is its own firehose).
 */
const SECURITY = new RegExp(
  `\\b(` +
    [
      'war', 'wars', 'invade', 'invasion', 'invades', 'strike', 'strikes', 'airstrike', 'missile', 'missiles', 'nuclear', 'nuke',
      'ceasefire', 'cease-fire', 'truce', 'peace deal', 'troops', 'nato', 'coup', 'sanction', 'sanctions', 'attack', 'attacks',
      'hostage', 'hostages', 'regime', 'military', 'conflict', 'terror', 'terrorist', 'assassinat\\w*', 'martial law', 'protest',
      'protests', 'riot', 'riots', 'annex', 'annexation', 'blockade', 'drone', 'drones', 'warship', 'clash', 'clashes', 'escalat\\w*',
      'treaty', 'border', 'recapture', 'capture', 'surrender', 'casualties', 'cyberattack', 'cyber', 'sabotage', 'strait', 'hormuz',
      'houthi', 'houthis', 'hezbollah', 'hamas', 'idf', 'pentagon', 'draft', 'mobilization', 'embargo', 'shutdown of', 'power grid',
      'nuclear test', 'enrichment', 'iaea', 'carrier', 'submarine', 'air defense', 'no-fly', 'refugee', 'refugees', 'genocide',
    ].join('|') +
    `)\\b`,
  'i',
)
const ELECTION = /\b(election|elections|president|prime minister|parliament|referendum|impeach\w*|resign\w*|out as|ousted|leader of|supreme leader|chancellor)\b/i
const NOISE =
  /\b(nba|nfl|mlb|nhl|ufc|fifa|world cup|super bowl|oscar|oscars|grammy|emmy|album|movie|box office|billboard|tweet|tweets|youtube|streamer|bitcoin|ethereum|crypto|solana|stock|s&p|nasdaq|temperature|hurricane season|rotten tomatoes|spotify|taylor swift|kardashian|love island|big brother|survivor|celebrity|star wars|avengers|secret wars|doctor doom|doomsday|marvel|pokemon|anime|elden ring|video game|gta)\b/i

export type Gate = { pass: boolean; why?: string }

export function gate(text: string, headTitle: string): Gate {
  if (NOISE.test(headTitle)) return { pass: false }
  if (SECURITY.test(text)) return { pass: true, why: 'security' }
  if (ELECTION.test(headTitle)) {
    const hit = geolocateAvoiding([], headTitle)
    // Country-level only: city/state races (NYC mayor, Taipei mayor) are local politics, not signal.
    if (hit && hit.kind === 'country' && hit.name !== 'United States') return { pass: true, why: 'election' }
  }
  return { pass: false }
}

/** Position the market is ABOUT: skip the US when something else is named. */
export function locateMarket(title: string, headline: string) {
  return geolocateAvoiding(['United States'], title, headline)
}
