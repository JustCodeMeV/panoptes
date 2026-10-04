import { useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react'
import { useDesign } from './context'

type Pt = [number, number]

/** Outline shapes for the cut-corner frames, in px for the measured size. Other frames are plain CSS. */
const SHAPES: Record<number, (w: number, h: number) => { pts: Pt[]; cuts: Pt[][] }> = {
  0: (w, h, c = 16) => ({ pts: [[c, 0], [w, 0], [w, h - c], [w - c, h], [0, h], [0, c]], cuts: [[[0, c], [c, 0]], [[w, h - c], [w - c, h]]] }),
  1: (w, h, c = 12) => ({
    pts: [[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]],
    cuts: [[[0, c], [c, 0]], [[w - c, 0], [w, c]], [[w, h - c], [w - c, h]], [[c, h], [0, h - c]]],
  }),
  3: (w, h) => ({ pts: [[0, 0], [w - 26, 0], [w, 26], [w, h], [10, h], [0, h - 10]], cuts: [[[w - 26, 0], [w, 26]]] }),
  8: (w, h, c = 20) => ({ pts: [[c, 0], [w, 0], [w, h], [0, h], [0, c]], cuts: [[[0, c], [c, 0]]] }),
}
const str = (pts: Pt[]) => pts.map(([x, y]) => `${x},${y}`).join(' ')

/** Floating panel in the design's frame and surface. Wrap every panel (layer list, dock, news) in it. */
export function Panel({
  className = '',
  children,
  label = 'ARGUS // SYS-01',
  onMinimize,
  minimized = false,
  ...props
}: HTMLAttributes<HTMLElement> & {
  label?: string
  /** Adds the universal minimise button: the accent square in the top-right corner. */
  onMinimize?: () => void
  minimized?: boolean
}) {
  const v = useDesign().frame
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<[number, number] | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !SHAPES[v]) return
    const ro = new ResizeObserver(([e]) => setSize([e.contentRect.width, e.contentRect.height]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [v])

  const shape = SHAPES[v] && size ? SHAPES[v](size[0], size[1]) : null
  const clip = shape ? `polygon(${shape.pts.map(([x, y]) => `${x}px ${y}px`).join(',')})` : v === 7 ? 'inset(0 round 14px)' : undefined

  return (
    // A flex column all the way down: given a height (h-full) the panel fills it; given only a
    // max-height it hugs its content and lets an inner Scroller take up the slack.
    <section className={`g-panel flex flex-col ${className}`} {...props}>
      <div ref={ref} className={`fr fr-${v + 1} flex min-h-0 flex-auto flex-col ${onMinimize ? 'has-min' : ''}`}>
        <div className="fr-fill g-overlay flex min-h-0 flex-auto flex-col" style={{ clipPath: clip }}>
          {children}
        </div>
        {shape && (
          <svg className="fr-svg" width={size![0]} height={size![1]} aria-hidden>
            <polygon points={str(shape.pts)} fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
            {shape.cuts.map((seg, i) => (
              <polyline key={i} points={str(seg)} fill="none" stroke="var(--color-accent-2)" strokeWidth="2" />
            ))}
          </svg>
        )}
        {v === 2 && [0, 1, 2, 3].map((i) => <span key={i} className="br" />)}
        {v === 6 && [0, 1, 2, 3].map((i) => <span key={i} className="sq" />)}
        {v === 8 && <span className="ticks" />}
        {v === 9 && <span className="bar">{label}</span>}
        {onMinimize && (
          <button type="button" className="min-sq" onClick={onMinimize} aria-label={minimized ? 'Expand' : 'Minimise'} title={minimized ? 'Expand' : 'Minimise'} aria-expanded={!minimized}>
            <svg viewBox="0 0 18 18" aria-hidden>
              <path d={minimized ? 'M5 9H13M9 5V13' : 'M5 9H13'} />
            </svg>
          </button>
        )}
      </div>
    </section>
  )
}
