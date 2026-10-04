import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

// Visible this long after the last scroll or pointer move, then fades away
const COOLDOWN_MS = 1500
const MIN_THUMB = 24

/**
 * Vertical scroll area with an overlay scrollbar that only shows while you use it: it fades in
 * as soon as you scroll (or move the pointer over the area), stays while you keep moving or
 * drag it, and fades out after a short cooldown. Never scrolls sideways: content wraps to the
 * width instead. Same behaviour on every platform, mouse or touch.
 */
export function Scroller({
  children,
  className = '',
  style,
  innerClassName = '',
  innerStyle,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Classes and style for the scrolling element itself (e.g. its max-height). */
  innerClassName?: string
  innerStyle?: CSSProperties
}) {
  const area = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const drag = useRef<{ y: number; top: number } | null>(null)
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null)
  const [active, setActive] = useState(false)

  const measure = useCallback(() => {
    const el = area.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) return setThumb(null)
    const height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight)
    setThumb({ height, top: (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height) })
  }, [])

  const poke = useCallback(() => {
    setActive(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => !drag.current && setActive(false), COOLDOWN_MS)
  }, [])

  useLayoutEffect(measure, [measure])
  useEffect(() => {
    const ro = new ResizeObserver(measure)
    if (area.current) ro.observe(area.current)
    if (content.current) ro.observe(content.current)
    return () => {
      ro.disconnect()
      clearTimeout(timer.current)
    }
  }, [measure])

  const onThumbMove = (e: React.PointerEvent) => {
    const el = area.current
    if (!drag.current || !el || !thumb) return
    const track = el.clientHeight - thumb.height
    el.scrollTop = drag.current.top + ((e.clientY - drag.current.y) / track) * (el.scrollHeight - el.clientHeight)
  }

  return (
    <div className={`relative flex min-h-0 flex-col ${className}`} style={style} onPointerMove={poke}>
      <div
        ref={area}
        className={`no-sb min-h-0 flex-auto overflow-x-hidden overflow-y-auto [overflow-wrap:anywhere] ${innerClassName}`}
        style={innerStyle}
        onScroll={() => {
          measure()
          poke()
        }}
      >
        <div ref={content} className="min-w-0">
          {children}
        </div>
      </div>
      {thumb && (
        <div
          role="presentation"
          className={`group absolute top-0 right-0 w-2.5 cursor-pointer touch-none ${active ? 'opacity-100 transition-opacity duration-150' : 'pointer-events-none opacity-0 transition-opacity duration-700'}`}
          style={{ transform: `translateY(${thumb.top}px)`, height: thumb.height }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drag.current = { y: e.clientY, top: area.current?.scrollTop ?? 0 }
            poke()
          }}
          onPointerMove={onThumbMove}
          onPointerUp={() => {
            drag.current = null
            poke()
          }}
        >
          <span className="absolute inset-y-0 right-0.5 w-[3px] bg-accent-2/60 transition-[width,background-color] duration-150 group-hover:w-[5px] group-hover:bg-accent-2" />
        </div>
      )}
    </div>
  )
}
