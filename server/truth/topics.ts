/**
 * Topic gate: signals only become narratives when they touch security,
 * conflict, unrest, politics or disinformation. Trends feeds are mostly
 * sport/celebrity noise; extend this list to widen scope.
 */
export const TOPIC_RE = new RegExp(
  `\\b(` +
    [
      'war', 'wars', 'attack', 'attacks', 'attacked', 'strike', 'strikes', 'missile', 'missiles', 'drone', 'drones',
      'bomb', 'bombing', 'explosion', 'explosions', 'blast', 'shelling', 'invasion', 'invade', 'troops', 'army',
      'military', 'navy', 'airstrike', 'airstrikes', 'ceasefire', 'truce', 'hostage', 'hostages', 'terror',
      'terrorist', 'terrorism', 'nuclear', 'nato', 'sanction', 'sanctions', 'coup', 'riot', 'riots', 'protest',
      'protests', 'protester', 'protesters', 'unrest', 'clashes', 'crackdown', 'curfew', 'martial', 'election',
      'elections', 'ballot', 'rigged', 'parliament', 'border',
      'migrant', 'migrants', 'refugee', 'refugees', 'cyberattack', 
      'disinformation', 'misinformation', 'propaganda', 'deepfake', 'hoax', 'conspiracy', 
      'iran', 'israel', 'gaza', 'hamas', 'hezbollah', 'houthi', 'ukraine', 'russia', 'russian', 'putin', 'zelensky',
      'kremlin', 'taiwan', 'china', 'chinese', 'korea', 'syria', 'yemen', 'lebanon', 'sudan', 'pentagon', 'idf',
      'shooting', 'killed', 'casualties', 'evacuation', 'pandemic', 'outbreak',
    ].join('|') +
    `)\\b`,
  'i',
)

export const isTopical = (text: string) => TOPIC_RE.test(text)
