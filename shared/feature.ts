import { z } from 'zod'

/**
 * Normalized unit of data for EVERY layer. Providers emit these, the server
 * aggregates them, the client renders them. Keep it platform-agnostic: anything
 * source-specific goes in `props`.
 *
 * Provenance fields (`source`, `geoPrecision`, `geoBasis`) are first-class so
 * later modules (cases, correlation, disinformation scoring) can always answer
 * "where did this come from and how sure are we about where it is?".
 */

/** How trustworthy the position is. UI must surface this. */
export const GeoPrecision = z.enum([
  'exact', // device/platform-reported coordinates
  'approximate', // known base (e.g. broadcaster HQ), not the event itself
  'inferred', // guessed from text (title, description)
  'none', // no known location; listed in the panel, not drawn on the globe
])
export type GeoPrecision = z.infer<typeof GeoPrecision>

export const FeatureSchema = z.object({
  /** Globally unique & stable: `${layerId}:${platform}:${externalId}`. */
  id: z.string(),
  layerId: z.string(),
  title: z.string(),
  /** Absent for placeless items (e.g. a narrative that names no location). */
  position: z
    .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
    .optional(),
  geoPrecision: GeoPrecision,
  /** Human-readable reason for the position, e.g. `matched "Kyiv" in title`. */
  geoBasis: z.string().optional(),
  /** ISO time the underlying thing was observed / started. */
  observedAt: z.string(),
  source: z.object({
    provider: z.string(), // our provider id, e.g. "youtube-scrape"
    platform: z.string(), // e.g. "youtube"
    url: z.string().optional(), // canonical link to the original
    retrievedAt: z.string(),
  }),
  /** How the dashboard can show the thing in-place. */
  media: z
    .object({
      kind: z.enum(['iframe', 'link']),
      url: z.string(),
    })
    .optional(),
  tags: z.array(z.string()).default([]),
  /** Layer-specific extras (viewers, channel, ...). */
  props: z.record(z.string(), z.unknown()).default({}),
})
export type Feature = z.infer<typeof FeatureSchema>

/** What each provider reported on its last run, shown in the UI. */
export const ProviderStatusSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  count: z.number(),
  error: z.string().optional(),
  ms: z.number(),
})
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>

export const LayerResponseSchema = z.object({
  layerId: z.string(),
  generatedAt: z.string(),
  features: z.array(FeatureSchema),
  providers: z.array(ProviderStatusSchema),
})
export type LayerResponse = z.infer<typeof LayerResponseSchema>
