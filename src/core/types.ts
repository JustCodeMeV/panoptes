import type { ComponentType } from 'react'
import type { Feature } from '../../shared/feature'

/** Layer components never import the store (it imports the registry); they get actions via props. */
export type ControlsProps = {
  /** Adds an analyst-created feature to this layer, selects it and flies to it. */
  pin(feature: Feature): void
  /** This layer's current features (ranked), for boards and summaries. */
  features?: Feature[]
  /** Opens a feature in the analysis panel. */
  select?(id: string): void
}

/** Layer panel groups, in display order: verification first, then sources, money, conflict, signals, and the physical world last. */
export const LAYER_GROUPS = ['Truth & overview', 'News & social media', 'Markets & economy', 'War & security', 'Jamming, outages & cyber', 'Hazards & humanitarian', 'Space & infrastructure'] as const
export type LayerGroup = (typeof LAYER_GROUPS)[number]

/** Layer-specific text/colour for a live-wire row. */
export type TickerView = { badge: string; color: string; detail?: string }

/** Props every layer's detail view receives (no store imports in layer code). */
export type DetailProps = { feature: Feature; select(id: string | null): void }

export type PinStyle = {
  /** px, before clustering */
  size: number
  /** Overrides the layer colour for this pin (e.g. verdict colour). */
  color?: string
  glyph?: 'play' | 'alert' | 'news' | 'chart' | 'pulse'
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
  /** SSE endpoint: the layer is pushed live instead of polled. */
  stream?: string
  defaultEnabled?: boolean
  /** Panel group the layer is listed under (see LAYER_GROUPS). */
  group?: LayerGroup
  /** Not listed in the layer panel (e.g. the atlas, driven by clicking the globe). */
  hidden?: boolean
  pin(feature: Feature): PinStyle
  /** Style for features carrying `geometry` (polygons/lines), drawn instead of a pin. */
  shape?(feature: Feature): { color?: string; alpha?: number; width?: number }
  /** How a live event for this layer reads in the wire. Default: neutral. */
  ticker?(feature: Feature, e: { kind: 'new' | 'update'; change?: string; source?: string }): TickerView
  /** Which features pre-fill the live wire on load (default: 8 newest). */
  seed?(features: Feature[]): Feature[]
  /** Higher = listed first in the panel. */
  rank?(feature: Feature): number
  /** Extra controls rendered inside the layer's panel section. */
  Controls?: ComponentType<ControlsProps>
  /** One-line secondary text for list rows. */
  subtitle(feature: Feature): string
  /** Rendered in the detail dock when a feature of this layer is selected. */
  Detail: ComponentType<DetailProps>
}
