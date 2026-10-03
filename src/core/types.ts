import type { ComponentType } from 'react'
import type { Feature } from '../../shared/feature'

export type PinStyle = {
  /** px, before clustering */
  size: number
}

/**
 * CLIENT LAYER CONTRACT. Everything layer-specific lives behind this; the
 * globe, panel, store and dock are generic. Add a layer = implement this in
 * `src/layers/<id>/index.tsx` and add it to `src/layers/index.ts`.
 * The server must expose `GET /api/layers/<id>` (see server/layers.ts).
 */
export interface LayerDef {
  id: string
  label: string
  description: string
  /** CSS colour; used for pins, clusters, panel accents. */
  color: string
  refreshMs: number
  defaultEnabled?: boolean
  pin(feature: Feature): PinStyle
  /** One-line secondary text for list rows. */
  subtitle(feature: Feature): string
  /** Rendered in the detail dock when a feature of this layer is selected. */
  Detail: ComponentType<{ feature: Feature }>
}
