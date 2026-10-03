import type { ReactNode } from 'react'
import { useDesign } from './context'

export type Tone = 'accent' | 'ok' | 'warn' | 'err' | 'live'

/** Counts, LIVE tags and status chips. `tone` picks the colour (status colours come from the design). */
export function Badge({ tone = 'accent', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  const v = useDesign().badge
  return (
    <span
      className={`bd bd-${v + 1} ${v === 0 ? 'chamfer' : ''} ${className}`}
      style={{ ['--bc' as string]: tone === 'accent' ? 'var(--color-accent)' : `var(--color-${tone})` }}
    >
      {v === 6 ? <><i>&lt;</i>{children}<i>/&gt;</i></> : children}
    </span>
  )
}
