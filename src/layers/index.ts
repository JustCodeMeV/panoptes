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

/** CLIENT LAYER REGISTRY. One line per layer. */
export const LAYERS: LayerDef[] = [watch, campaigns, unrest, news, markets, acled, osint, gnss, militaryAir, frontlines, infrastructure, livestreams, narratives]
