export const moveColor = (d: number) => (d >= 2 ? '#16a34a' : d >= 0.3 ? '#4ade80' : d > -0.3 ? '#94a3b8' : d > -2 ? '#f87171' : '#dc2626')
export const pct = (v: unknown) => (typeof v === 'number' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '–')
export const price = (v: unknown) => (typeof v === 'number' ? (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(v < 10 ? 4 : 2)) : '–')
