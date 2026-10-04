/**
 * Topic gate: signals only become narratives when they touch security,
 * conflict, unrest, politics or disinformation. Trends feeds are mostly
 * sport/celebrity noise; extend this list to widen scope.
 */
export const TOPIC_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(` +
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
      // conflicts beyond the usual theatres (Africa, Latin America, Asia)
      'gang', 'gangs', 'cartel', 'cartels', 'militia', 'militias', 'rebel', 'rebels', 'insurgent', 'insurgents', 'insurgency',
      'jihadist', 'jihadists', 'junta', 'kidnapped', 'kidnapping', 'abducted', 'massacre', 'genocide', 'displaced', 'famine',
      'al-shabaab', 'shabaab', 'boko haram', 'iswap', 'jnim', 'm23', 'rsf', 'tatmadaw', 'eln', 'darfur', 'sahel', 'kivu',
      'myanmar', 'haiti', 'somalia', 'ethiopia', 'congo', 'mali', 'burkina', 'niger', 'nigeria', 'venezuela', 'colombia', 'mexico',
      // Spanish / Portuguese / French
      'guerra', 'ataque', 'ataques', 'protestas', 'protesta', 'manifestación', 'enfrentamientos', 'violencia', 'pandillas',
      'narcotráfico', 'cártel', 'ejército', 'militares', 'elecciones', 'golpe de estado', 'asesinato', 'asesinados', 'secuestro',
      'muertos', 'desplazados', 'guerrilla', 'protesto', 'protestos', 'violência', 'facção', 'eleições', 'mortos', 'tiroteio',
      'attaque', 'attentat', 'affrontements', 'manifestation', 'manifestations', 'violences', 'armée', 'élection', 'élections',
      'coup d’état', 'djihadistes', 'jihadistes', 'enlèvement', 'tués', 'rebelles', 'déplacés',
    ].join('|') +
    `)(?![\\p{L}\\p{N}])`,
  'iu',
)

export const isTopical = (text: string) => TOPIC_RE.test(text)
