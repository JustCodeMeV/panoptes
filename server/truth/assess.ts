import type { Assessment, Coverage, FactCheckMatch, Signal, Verdict } from '../../shared/truth.ts'
import { MATCH_STRONG } from './factchecks.ts'

/** Distinct feeds a narrative appears on. Mastodon instances mirror one network, so they count once. */
export const spreadOf = (signals: Signal[]) =>
  new Set(signals.map((s) => (s.platform === 'mastodon' ? 'mastodon' : `${s.platform}:${s.region ?? ''}`))).size

/**
 * Turns gathered evidence into a verdict + attention score. Deliberately
 * simple and fully explained via `reasons`: an analyst must be able to see
 * WHY, and override it. Never presented as ground truth.
 */
export function assess(input: {
  signals: Signal[]
  factChecks: FactCheckMatch[]
  coverage: Coverage | null
  coverageError?: string
  /** Coverage lookup is queued but has not run yet. */
  coveragePending?: boolean
}): Assessment {
  const { signals, factChecks, coverage } = input
  const reasons: string[] = []
  const strong = factChecks.filter((m) => m.score >= MATCH_STRONG)
  const falseHit = strong.find((m) => m.verdict === 'false')
  const mislead = strong.find((m) => m.verdict === 'misleading' || m.verdict === 'analysis')
  const trueHit = strong.find((m) => m.verdict === 'true')
  const established = coverage?.establishedOutlets.length ?? 0
  const stateOnly = !!coverage && coverage.stateOutlets.length > 0 && established === 0
  const spread = spreadOf(signals)
  const volume = signals.reduce((n, s) => n + (s.volume ?? 0), 0)

  let verdict: Verdict
  if (falseHit) {
    verdict = 'debunked'
    reasons.push(`${falseHit.publisher} fact-check rates a matching claim false (${Math.round(falseHit.score * 100)}% term match)`)
  } else if (mislead) {
    verdict = 'disputed'
    reasons.push(`${mislead.publisher} flags a matching claim as misleading/disinformation (${Math.round(mislead.score * 100)}% term match)`)
  } else if (trueHit) {
    verdict = 'corroborated'
    reasons.push(`${trueHit.publisher} fact-check supports a matching claim`)
  } else if (established >= 2) {
    verdict = 'corroborated'
    reasons.push(`covered by ${established} established outlets: ${coverage!.establishedOutlets.slice(0, 4).join(', ')}`)
  } else if (coverage && (spread >= 2 || volume >= 10_000 || signals.some((s) => s.platform === 'user-input'))) {
    verdict = 'unverified'
    reasons.push(
      established === 1
        ? `only 1 established outlet covers it (${coverage.establishedOutlets[0]}) out of ${coverage.domains} domains`
        : `${coverage.total} articles from ${coverage.domains} domains, none from the established-outlet list`,
    )
  } else if (!coverage && (spread >= 2 || volume >= 10_000)) {
    verdict = 'unverified'
    reasons.push(`spreading across sources; news-coverage lookup ${input.coveragePending ? 'in progress' : 'unavailable'}`)
  } else {
    verdict = 'insufficient'
    reasons.push(coverage ? 'low spread and little coverage; not enough to judge' : input.coveragePending ? 'no fact-check match; news-coverage lookup in progress' : 'no fact-check match and no coverage data')
  }

  if (stateOnly) reasons.push(`coverage comes only from state-affiliated outlets: ${coverage!.stateOutlets.join(', ')}`)
  if (coverage && coverage.stateOutlets.length && established > 0) reasons.push(`also pushed by state-affiliated outlets: ${coverage.stateOutlets.join(', ')}`)
  if (spread >= 2) reasons.push(`appears on ${spread} distinct platform/region feeds`)
  if (input.coverageError) reasons.push(`coverage lookup failed: ${input.coverageError}`)
  else if (input.coveragePending && !coverage) reasons.push('news-coverage lookup still running (GDELT is rate-limited): re-check in a minute')
  const weak = factChecks.filter((m) => m.score < MATCH_STRONG)
  if (weak.length && !falseHit && !mislead) reasons.push(`${weak.length} weaker fact-check match(es) listed for review`)

  const base: Record<Verdict, number> = { debunked: 60, disputed: 45, unverified: 30, insufficient: 10, corroborated: 5 }
  let risk = base[verdict]
  risk += Math.min(25, Math.max(0, spread - 1) * 8)
  risk += Math.min(15, Math.round(Math.log10(volume + 1) * 3))
  if (stateOnly) risk += 10
  risk = Math.max(0, Math.min(100, risk))

  return { verdict, risk, reasons, factChecks, coverage, signals, spread }
}
