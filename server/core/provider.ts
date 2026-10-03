import type { Feature } from '../../shared/feature.ts'

export type ProviderContext = {
  signal: AbortSignal
}

/**
 * A Provider turns one external source into normalized Features for ONE layer.
 * To add a source: implement this, register it in `server/layers.ts`.
 */
export interface Provider {
  id: string
  layerId: string
  /** Return false to be skipped (e.g. missing API key). */
  enabled?(): boolean
  fetch(ctx: ProviderContext): Promise<Feature[]>
}
