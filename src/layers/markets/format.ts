import type { MarketProps } from '../../../shared/markets'

export const marketOf = (f: { props: Record<string, unknown> }) => f.props as unknown as MarketProps & { ring?: { t: number; p: number }[] }
export const pct = (p: number) => `${Math.round(p * 100)}%`
export const pts = (d: number) => `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)} pts`

export function money(n: number, unit: MarketProps['unit']): string {
  const v = n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${Math.round(n)}`
  return unit === 'usd' ? `$${v}` : unit === 'mana' ? `Ṁ${v}` : `${v} contracts`
}

/** Colour of a probability move: red = rising odds of the event, green = falling. */
export const moveColor = (d: number) => (d > 0 ? '#f87171' : '#4ade80')
