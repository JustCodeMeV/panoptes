import type { MarketRef } from '../../shared/markets.ts'
import type { Assessment, Coverage, FactCheckMatch, Signal, Verdict } from '../../shared/truth.ts'
import { MATCH_STRONG } from './factchecks.ts'

const how = (m: FactCheckMatch) => (m.judged === 'same' ? 'same claim, AI-judged' : `${Math.round(m.score * 100)}% term match`)

/** Distinct feeds a narrative appears on. Mastodon instances mirror one network, so they count once. */
export const spreadOf = (signals: Signal[]) =>
  new Set(signals.map((s) => (s.platform === 'mastodon' || s.platform === 'bluesky' ? s.platform : `${s.platform}:${s.region ?? ''}`))).size

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
  /** Related prediction markets (what money says). */
  markets?: MarketRef[]
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
    reasons.push(`${falseHit.publisher} fact-check rates a matching claim false (${how(falseHit)})`)
  } else if (mislead) {
    verdict = 'disputed'
    reasons.push(`${mislead.publisher} flags a matching claim as misleading/disinformation (${how(mislead)})`)
  } else if (trueHit) {
    verdict = 'corroborated'
    reasons.push(`${trueHit.publisher} fact-check supports a matching claim`)
  } else if (established >= 2) {
    verdict = 'corroborated'
    reasons.push(`covered by ${established} established outlets: ${coverage!.establishedOutlets.slice(0, 4).join(', ')}`)
  } else if (coverage && (spread >= 2 || volume >= 10_000 || established >= 1 || stateOnly || signals.some((s) => s.platform === 'user-input'))) {
    verdict = 'unverified'
    reasons.push(
      established === 1
        ? `only 1 established outlet covers it so far (${coverage.establishedOutlets[0]}) out of ${coverage.domains} domains`
        : coverage.domains === 0
          ? 'only social accounts report it so far; no news outlet has covered it yet'
          : stateOnly
          ? `reported only by state-affiliated outlets so far (${coverage.domains} domains)`
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

  // Money as an independent signal. Only real-money markets with some depth count.
  const markets = input.markets ?? []
  const solid = markets.filter((m) => !m.playMoney && m.trust >= 35)
  const pct = (m: MarketRef) => `${Math.round(m.p * 100)}%`
  const label = (m: MarketRef) => (m.headline === 'Yes' ? m.title : `${m.title} [${m.headline}]`)
  let marketBump = 0
  for (const m of solid.slice(0, 2)) {
    reasons.push(`${m.platform} prices "${label(m)}" at ${pct(m)}${m.change24h ? ` (${m.change24h > 0 ? '+' : ''}${Math.round(m.change24h * 100)} pts/24h)` : ''} with ${Math.round(m.trust)}/100 market depth`)
    if (m.p >= 0.5 && (verdict === 'unverified' || verdict === 'insufficient')) {
      reasons.push('markets treat this as likely while confirmation is still thin: worth a closer look')
      marketBump = Math.max(marketBump, 12)
    }
    if (Math.abs(m.change24h ?? 0) >= 0.08) marketBump = Math.max(marketBump, 8)
  }
  for (const m of markets.filter((x) => x.playMoney).slice(0, 1)) reasons.push(`${m.platform} (play money, low weight) shows ${pct(m)} for "${label(m)}"`)

  const base: Record<Verdict, number> = { debunked: 60, disputed: 45, unverified: 30, insufficient: 10, corroborated: 5 }
  let risk = base[verdict]
  risk += Math.min(25, Math.max(0, spread - 1) * 8)
  risk += Math.min(15, Math.round(Math.log10(volume + 1) * 3))
  if (stateOnly) risk += 10
  risk += marketBump
  risk = Math.max(0, Math.min(100, risk))

  return { verdict, risk, reasons, factChecks, coverage, signals, spread, markets: markets.length ? markets : undefined }
}
