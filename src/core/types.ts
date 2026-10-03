import type { ComponentType } from 'react'
import type { Feature } from '../../shared/feature'

/** Layer components never import the store (it imports the registry); they get actions via props. */
export type ControlsProps = {
  /** Adds an analyst-created feature to this layer, selects it and flies to it. */
  pin(feature: Feature): void
}

export type PinStyle = {
  /** px, before clustering */
  size: number
  /** Overrides the layer colour for this pin (e.g. verdict colour). */
  color?: string
  glyph?: 'play' | 'alert'
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
  /** Higher = listed first in the panel. */
  rank?(feature: Feature): number
  /** Extra controls rendered inside the layer's panel section. */
  Controls?: ComponentType<ControlsProps>
  /** One-line secondary text for list rows. */
  subtitle(feature: Feature): string
  /** Rendered in the detail dock when a feature of this layer is selected. */
  Detail: ComponentType<{ feature: Feature }>
}
