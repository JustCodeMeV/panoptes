import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import { useDesign } from './context'

const BASE = 'inline-flex items-center justify-center gap-2 text-sm whitespace-nowrap cursor-pointer select-none transition duration-150 disabled:pointer-events-none disabled:opacity-40'
const CHAMFER = '[clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)]'

/** [primary, secondary] classes for each button style in catalog.BUTTON_NAMES. */
const BUTTON_STYLES: [string, string][] = [
  ['rounded-full bg-accent text-bg font-semibold px-4 py-1.5 shadow-glow hover:brightness-110', 'rounded-full border border-line text-ink px-4 py-1.5 hover:border-accent hover:text-accent'],
  ['rounded-md border border-accent/70 text-accent font-medium px-4 py-1.5 shadow-glow hover:bg-accent/10', 'rounded-md border border-line text-dim px-4 py-1.5 hover:border-ink/40 hover:text-ink'],
  ['rounded-md text-accent font-medium px-3 py-1.5 hover:bg-accent/10', 'rounded-md text-dim px-3 py-1.5 hover:bg-ink/5 hover:text-ink'],
  ['rounded-l-full rounded-r-sm bg-accent text-bg text-xs font-bold uppercase tracking-[0.18em] pl-5 pr-3 py-2 hover:brightness-110', 'rounded-l-full rounded-r-sm bg-accent-2/80 text-bg text-xs font-bold uppercase tracking-[0.18em] pl-5 pr-3 py-2 hover:bg-accent-2'],
  [`${CHAMFER} bg-accent text-bg text-xs font-semibold uppercase tracking-widest px-5 py-2 hover:brightness-110`, `${CHAMFER} bg-accent/15 text-accent text-xs font-semibold uppercase tracking-widest px-5 py-2 hover:bg-accent/25`],
  ['rounded-lg bg-ink/10 backdrop-blur border border-ink/20 text-ink font-medium px-4 py-1.5 hover:border-accent hover:shadow-glow', 'rounded-lg bg-ink/5 border border-ink/10 text-dim px-4 py-1.5 hover:text-ink'],
  ['border-b-2 border-accent text-accent text-xs uppercase tracking-[0.2em] px-1 pt-1.5 pb-1 hover:text-shadow-glow', 'border-b-2 border-transparent text-dim text-xs uppercase tracking-[0.2em] px-1 pt-1.5 pb-1 hover:border-dim hover:text-ink'],
  ['rounded-md bg-linear-to-r from-accent to-accent-2 text-bg font-semibold px-4 py-1.5 shadow-glow hover:brightness-110', 'rounded-md border border-accent/40 text-accent px-4 py-1.5 hover:border-accent-2 hover:text-accent-2'],
  ['rounded-sm border-l-[3px] border-accent bg-accent/10 text-ink font-medium pl-3 pr-4 py-1.5 hover:bg-accent/20', 'rounded-sm border-l-[3px] border-line bg-ink/5 text-dim pl-3 pr-4 py-1.5 hover:border-dim hover:text-ink'],
  ['border border-accent text-accent text-[11px] uppercase tracking-[0.22em] px-4 py-2 hover:bg-accent hover:text-bg', 'border border-line text-dim text-[11px] uppercase tracking-[0.22em] px-4 py-2 hover:border-ink/50 hover:text-ink'],
]

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger'
  loading?: boolean
}

export function Button({ variant = 'primary', loading = false, className = '', type = 'button', style, children, disabled, ...props }: Props) {
  const [primary, secondary] = BUTTON_STYLES[useDesign().button]
  // Danger is the primary style with the accent swapped for the error colour
  const danger: CSSProperties | undefined = variant === 'danger' ? ({ '--color-accent': 'var(--color-err)', '--color-accent-2': 'var(--color-err)' } as CSSProperties) : undefined
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn ${BASE} ${variant === 'secondary' ? secondary : primary} ${className}`}
      style={{ ...danger, ...style }}
      {...props}
    >
      {loading && <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}
