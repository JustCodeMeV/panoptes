import type { LayerDef } from '../core/types'
import { livestreams } from './livestreams'
import { narratives } from './narratives'

/** CLIENT LAYER REGISTRY. One line per layer. */
export const LAYERS: LayerDef[] = [livestreams, narratives]
