import type { MarketRef } from '../../shared/markets.ts'
import { tokenSet } from '../truth/text.ts'

/**
 * Cross-reference registry between live engines (news <-> markets) without
 * import cycles: each engine registers a lookup; the other calls it.
 */
export type StoryRef = { id: string; title: string; outlets: number; verdict: string; tokens: Set<string> }
export type MarketIndexEntry = MarketRef & { tokens: Set<string> }

let stories: () => StoryRef[] = () => []
let markets: () => MarketIndexEntry[] = () => []
export const registerStories = (fn: () => StoryRef[]) => (stories = fn)
export const registerMarkets = (fn: () => MarketIndexEntry[]) => (markets = fn)

/**
 * Overlap of distinctive terms. Needs >=2 shared tokens of 4+ chars (so "war" +
 * "ukraine" alone is not enough to tie a Korea story to a Ukraine market) and at
 * least half of the smaller set shared.
 */
export function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0
  let strong = 0
  for (const t of a) {
    if (!b.has(t)) continue
    shared++
    if (t.length >= 4) strong++
  }
  if (strong < 2) return 0
  return shared / Math.min(a.size, b.size)
}

export function relatedMarkets(text: string, limit = 3): MarketRef[] {
  const t = tokenSet(text)
  return markets()
    .map((m) => ({ m, s: overlap(t, m.tokens) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s * (b.m.trust + 10) - a.s * (a.m.trust + 10))
    .slice(0, limit)
    .map(({ m }) => {
      const { tokens: _tokens, ...ref } = m
      void _tokens
      return ref
    })
}

export function relatedStories(tokens: Set<string>, limit = 4) {
  return stories()
    .map((s) => ({ s, o: overlap(tokens, s.tokens) }))
    .filter((x) => x.o >= 0.5)
    .sort((a, b) => b.o * Math.log2(b.s.outlets + 1.5) - a.o * Math.log2(a.s.outlets + 1.5))
    .slice(0, limit)
    .map(({ s }) => ({ id: s.id, title: s.title, outlets: s.outlets, verdict: s.verdict }))
}
