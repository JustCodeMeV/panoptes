import type { Feature, ProviderStatus } from './feature.ts'

/**
 * Wire format for push-driven layers (`GET /api/stream/:layer`, SSE).
 * `snapshot` (a LayerResponse) is sent once on connect, then these events.
 */
export type LiveEvent =
  | {
      type: 'upsert'
      kind: 'new' | 'update'
      feature: Feature
      /** Short human description of what changed, shown in the live wire. */
      change?: string
      /** The triggering item (e.g. the article that just arrived). */
      item?: { title: string; source: string; at: number }
    }
  | { type: 'remove'; ids: string[] }
  | { type: 'status'; at: number; providers: ProviderStatus[]; eventsPerMin: number }
  /** Quiet in-place replacement (e.g. a translation arrived): no wire row, no flash. */
  | { type: 'patch'; features: Feature[] }

export const LIVE_EVENT_TYPES = ['upsert', 'remove', 'status', 'patch'] as const
