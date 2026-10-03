import type { MarketRef } from './markets.ts'

/**
 * Truth-sensor types, shared by server (engine) and client (detail view).
 * An Assessment is an EVIDENCE SUMMARY, not a machine ruling on truth: every
 * verdict carries the reasons and links it was derived from.
 */

export type Verdict =
  | 'debunked' // matches a published fact-check that rates it false
  | 'disputed' // matches fact-check/analysis flagging it as misleading or disinformation
  | 'unverified' // spreading, but no fact-check and thin corroboration
  | 'corroborated' // multiple established outlets (or a fact-check) support it
  | 'insufficient' // not enough signal either way

/** Verdict as parsed from a fact-check's own headline/summary (keyword-based). */
export type ReviewVerdict = 'false' | 'misleading' | 'true' | 'analysis' | 'reviewed'

export type FactCheckMatch = {
  publisher: string
  title: string
  url: string
  date?: string
  verdict: ReviewVerdict
  /** 0..1 share of the claim's (idf-weighted) terms found in the fact-check. */
  score: number
}

export type CoverageArticle = {
  url: string
  title: string
  domain: string
  country?: string
  language?: string
  seen?: string
}

export type Coverage = {
  query: string
  window: string
  total: number
  domains: number
  countries: string[]
  establishedOutlets: string[]
  stateOutlets: string[]
  articles: CoverageArticle[]
}

export type Signal = {
  platform: string // google-trends | mastodon | user-input
  region?: string
  text: string
  volume?: number
  url?: string
  at: string
}

export type Assessment = {
  verdict: Verdict
  /** 0..100 attention priority, NOT a probability of falsehood. */
  risk: number
  reasons: string[]
  factChecks: FactCheckMatch[]
  coverage: Coverage | null
  signals: Signal[]
  /** Distinct platform+region pairs the narrative appears on. */
  spread: number
  /** Prediction markets that look related: what money says about it. */
  markets?: MarketRef[]
}
