/**
 * ENTITY GRAPH (Maltego-style). Every entry the layers ingest (a news story,
 * a Telegram post, a conflict log entry, a GDELT hotspot) is read, checked
 * and turned into typed entities linked by typed relations, so an analyst
 * can start from any item and expand outward.
 */

export type EntityType = 'event' | 'location' | 'actor' | 'source' | 'claim' | 'asset'

export type EventKind =
  | 'strike' | 'drone-attack' | 'shelling' | 'clash' | 'protest' | 'arrest' | 'explosion' | 'ceasefire'
  | 'talks' | 'sanction' | 'cyber' | 'disaster' | 'missile-test' | 'other'

export type Precision = 'exact' | 'town' | 'region' | 'country' | 'none'

/** How well an event is supported. Same rule for every country (see server/truth/domains.ts). */
export type CheckStatus = 'confirmed' | 'corroborated' | 'single-source' | 'government-only' | 'contested' | 'debunked'
export type Check = { status: CheckStatus; reasons: string[]; sources: number; independent: number; countries: number }

export type Entity = {
  id: string
  type: EntityType
  /** event: EventKind · actor: person | armed-group | government | military | party | org · source: outlet | channel | account · asset: vessel | aircraft | infrastructure | jamming-area · location: precision */
  subtype: string
  label: string
  props: Record<string, unknown>
  position?: { lat: number; lon: number }
  precision?: Precision
  firstSeen: number
  lastSeen: number
  /** 0..1: how sure the extraction is that this entity is real and correctly typed. */
  confidence: number
  check?: Check
}

export type Rel =
  | 'located_at' | 'involves' | 'reported_by' | 'claims' | 'about' | 'supports' | 'contradicts'
  | 'copies' | 'forwards' | 'near' | 'same_as' | 'mentions'

export type Role = 'attacker' | 'target' | 'victim' | 'claimant' | 'mediator' | 'participant'

export type Evidence = { featureId: string; url?: string; quote?: string }

export type Edge = {
  id: string
  from: string
  to: string
  rel: Rel
  role?: Role
  at: number
  evidence: Evidence[]
  confidence: number
  /** Which extractor produced it: rules (free) or llm (read by Claude). */
  via: 'rules' | 'llm' | 'resolve' | 'transform'
}

export type Subgraph = { entities: Entity[]; edges: Edge[] }

export type TransformDef = { id: string; label: string; types: EntityType[] }
