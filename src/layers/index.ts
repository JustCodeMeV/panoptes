import type { LayerDef } from '../core/types'
import { livestreams } from './livestreams'
import { markets } from './markets'
import { news } from './news'
import { osint } from './osint'
import { narratives } from './narratives'

/** CLIENT LAYER REGISTRY. One line per layer. */
export const LAYERS: LayerDef[] = [news, markets, osint, livestreams, narratives]
