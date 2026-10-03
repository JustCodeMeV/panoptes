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
  /** How long a successful result is reused, however many clients poll. Default 5 min. */
  ttlMs?: number
  /** Env vars without which the provider is 'off' (never called). */
  requires?: string[]
  fetch(ctx: ProviderContext): Promise<Feature[]>
}
