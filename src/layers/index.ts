import type { LayerDef } from '../core/types'
import { campaigns } from './campaigns'
import { livestreams } from './livestreams'
import { markets } from './markets'
import { news } from './news'
import { osint } from './osint'
import { unrest } from './unrest'
import { narratives } from './narratives'
import { watch } from './watch'

/** CLIENT LAYER REGISTRY. One line per layer. */
export const LAYERS: LayerDef[] = [watch, campaigns, unrest, news, markets, osint, livestreams, narratives]
