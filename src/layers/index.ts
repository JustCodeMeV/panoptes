import type { LayerDef } from '../core/types'
import { campaigns } from './campaigns'
import { livestreams } from './livestreams'
import { markets } from './markets'
import { news } from './news'
import { osint } from './osint'
import { unrest } from './unrest'
import { narratives } from './narratives'
import { watch } from './watch'
import { gnss } from './gnss'
import { militaryAir } from './military'
import { frontlines } from './frontlines'
import { acled } from './acled'
import { infrastructure } from './infrastructure'
import { telegram } from './telegram'
import { cii } from './cii'
import { trends } from './trends'
import { satellites } from './satellites'
import { ships } from './ships'
import { x } from './x'
import { events } from './events'
import { atlas } from './atlas'
import { finance } from './finance'
import { cyber } from './cyber'
import { hazards } from './hazards'
import { statements } from './statements'
import { research } from './research'
import { warnings } from './warnings'
import { humanitarian } from './humanitarian'

/** CLIENT LAYER REGISTRY. One line per layer. */
export const LAYERS: LayerDef[] = [
  atlas,
  // In panel order (groups: see LAYER_GROUPS)
  narratives, campaigns, events, cii, watch,
  news, telegram, x, livestreams, trends, statements, research,
  markets, finance,
  acled, frontlines, unrest, warnings, militaryAir, ships,
  gnss, osint, cyber,
  hazards, humanitarian,
  satellites, infrastructure,
]
