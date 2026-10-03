import type { Assessment, Verdict } from '../../../shared/truth'

export const assessmentOf = (f: { props: Record<string, unknown> }) => f.props.assessment as Assessment

export const VERDICT: Record<Verdict, { label: string; color: string; blurb: string }> = {
  debunked: { label: 'DEBUNKED', color: '#d946ef', blurb: 'Matches a published fact-check rating it false' },
  disputed: { label: 'DISPUTED', color: '#f97316', blurb: 'Flagged as misleading or disinformation by a fact-checker/analyst' },
  unverified: { label: 'UNVERIFIED', color: '#facc15', blurb: 'Spreading, but thinly corroborated and not fact-checked' },
  corroborated: { label: 'CORROBORATED', color: '#22c55e', blurb: 'Supported by a fact-check or several established outlets' },
  insufficient: { label: 'INSUFFICIENT', color: '#64748b', blurb: 'Not enough signal either way' },
}
