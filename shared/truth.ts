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
  /** Set when an LLM compared the claim with the fact-check (semantic, not lexical). */
  judged?: 'same' | 'related'
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

export type SourceClass = 'established' | 'state' | 'social' | 'other'

export type CampaignFlag = { id: string; label: string; severity: 'info' | 'warn' | 'alert'; detail: string }

/**
 * Pattern analysis of HOW a story spread. These are leads for an analyst, not
 * attribution: legitimate stories show some of the same patterns.
 */
export type Campaign = {
  /** 0..100 */
  score: number
  flags: CampaignFlag[]
  timeline: { at: number; source: string; cls: SourceClass; bloc?: string; title: string; url: string }[]
  blocs: string[]
  socialAccounts: number
  /** Minutes by which the first state item preceded the first established item (negative = after). */
  stateLeadMin?: number
  /** Distinct sources reaching the story in its first hour. */
  firstHourSources: number
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
  campaign?: Campaign
}

/** AI-generated analyst brief for a story / narrative. Always shown labelled as such. */
export type Brief = {
  summary: string
  whyFlagged: string[]
  frames: { actor: string; frame: string }[]
  checkNext: string[]
  glosses: { source: string; english: string }[]
  model: string
  at: string
}
