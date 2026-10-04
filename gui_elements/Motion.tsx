// Motion behaviours: panel movement, panel open/close, dock enter/exit and list animation.
// Timing comes from the design's motion tokens (--dur, --ease).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { durationMs } from './catalog'
import { useDesign } from './context'
import { Icon } from './Icon'

/** A panel that can be dragged inside its (relative) container, with the chosen movement behaviour. */
export function MovablePanel({ children, start = { x: 12, y: 12 } }: { children: ReactNode; start?: { x: number; y: number } }) {
  const d = useDesign()
  const v = d.panelMove
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(start)
  const [dragging, setDragging] = useState(false)
  const drag = useRef({ dx: 0, dy: 0, vx: 0, vy: 0, lx: 0, ly: 0, t: 0 })
  const raf = useRef(0)

  const bounds = () => {
    const el = ref.current!, parent = el.parentElement!
    return { maxX: parent.clientWidth - el.offsetWidth, maxY: parent.clientHeight - el.offsetHeight }
  }
  const clamp = (x: number, y: number) => {
    const { maxX, maxY } = bounds()
    return { x: Math.max(0, Math.min(maxX, x)), y: Math.max(0, Math.min(maxY, y)) }
  }

  const release = () => {
    setDragging(false)
    const { maxX, maxY } = bounds()
    if (v === 0) {
      // Inertia
      let { vx, vy } = drag.current
      const step = () => {
        vx *= 0.9
        vy *= 0.9
        setPos((p) => clamp(p.x + vx, p.y + vy))
        if (Math.abs(vx) + Math.abs(vy) > 0.3) raf.current = requestAnimationFrame(step)
      }
      raf.current = requestAnimationFrame(step)
    }
    if (v === 1) setPos((p) => ({ x: p.x < maxX / 2 ? 0 : maxX, y: p.y < maxY / 2 ? 0 : maxY }))
    if (v === 2) setPos((p) => ({ x: p.x < 30 ? 0 : p.x > maxX - 30 ? maxX : p.x, y: p.y < 30 ? 0 : p.y > maxY - 30 ? maxY : p.y }))
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  useEffect(() => {
    if (v === 3 && ref.current) setPos((p) => ({ x: p.x, y: bounds().maxY }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v])

  return (
    <div
      ref={ref}
      className={`absolute touch-none select-none ${v === 4 ? 'cursor-not-allowed' : dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ left: pos.x, top: pos.y, transition: dragging || v === 0 ? 'none' : `left var(--dur) var(--ease), top var(--dur) var(--ease)` }}
      onPointerDown={(e) => {
        if (v === 4) return
        cancelAnimationFrame(raf.current)
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, vx: 0, vy: 0, lx: e.clientX, ly: e.clientY, t: performance.now() }
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (!dragging) return
        const r = drag.current
        r.vx = e.clientX - r.lx
        r.vy = e.clientY - r.ly
        r.lx = e.clientX
        r.ly = e.clientY
        const next = clamp(e.clientX - r.dx, e.clientY - r.dy)
        setPos(v === 3 ? { x: next.x, y: bounds().maxY } : next)
      }}
      onPointerUp={release}
    >
      {v === 4 && <span className="absolute -top-2 -right-2 z-10 text-[10px] text-dim"><Icon name="settings" /></span>}
      {children}
    </div>
  )
}

/** Panel with the chosen open/close animation. Controlled by `open`. */
export function Collapsible({ open, children, label = 'Layers', onOpen }: { open: boolean; children: ReactNode; label?: string; onOpen?: () => void }) {
  const v = useDesign().panelOpen
  return (
    <div className="relative h-full">
      <div className={`mv po-${v + 1} h-full ${open ? '' : 'closed'}`} style={{ width: '100%' }}>
        {children}
      </div>
      {!open && v === 0 && (
        <button type="button" onClick={onOpen} className="sub absolute inset-y-0 left-0 w-[22px] cursor-pointer border border-line bg-panel text-[9px] text-accent [writing-mode:vertical-rl]">{label}</button>
      )}
      {!open && v === 6 && (
        <button type="button" onClick={onOpen} className="absolute top-0 left-0 grid size-7 cursor-pointer place-items-center border border-accent-2/60 bg-panel text-accent"><Icon name="layers" /></button>
      )}
      {/* Every other style still leaves a way back */}
      {!open && v !== 0 && v !== 6 && (
        <button type="button" onClick={onOpen} className="sub absolute top-0 left-0 cursor-pointer border border-accent-2/60 bg-panel px-2 py-1 text-[9px] text-accent">{label} ▸</button>
      )}
    </div>
  )
}

/** Detail dock that animates in on mount and out before it unmounts. */
export function DockTransition({ show, children }: { show: boolean; children: ReactNode }) {
  const d = useDesign()
  const [prevShow, setPrevShow] = useState(show)
  const [leaving, setLeaving] = useState(false)
  // Hiding starts the exit animation; the element unmounts once it has played
  if (show !== prevShow) {
    setPrevShow(show)
    setLeaving(!show)
  }
  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(false), durationMs(d) + 20)
    return () => clearTimeout(t)
  }, [leaving, d])
  if (!show && !leaving) return null
  return (
    <div key={leaving ? 'out' : 'in'} className={`da-${d.dockAnim + 1}`} style={leaving ? { animationDirection: 'reverse' } : undefined}>
      {children}
    </div>
  )
}

/** List whose new items animate in with the chosen list animation. */
export function AnimatedList<T extends { id: string }>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const v = useDesign().listAnim
  if (v === 6) return <PushList items={items} render={render} />
  return (
    <div className="flex flex-col">
      {items.map((it, i) => (
        <div key={it.id} className={v === 5 ? '' : `la-${v + 1}`} style={{ ['--i' as string]: i }}>
          {render(it)}
        </div>
      ))}
    </div>
  )
}

/** "Push down, new from left": existing rows glide down to their new place (FLIP), then the new row flies in from the left. */
function PushList<T extends { id: string }>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const els = useRef(new Map<string, HTMLDivElement>())
  const tops = useRef(new Map<string, number>())
  // Rows present on first render don't animate; every later arrival does
  const [initial] = useState(() => new Set(items.map((it) => it.id)))

  useLayoutEffect(() => {
    const next = new Map<string, number>()
    for (const [id, el] of els.current) {
      const top = el.offsetTop
      next.set(id, top)
      const prev = tops.current.get(id)
      if (prev === undefined || prev === top) continue
      // Start where it was, then let the transition carry it to where it is now
      el.style.transition = 'none'
      el.style.transform = `translateY(${prev - top}px)`
      void el.offsetHeight
      el.style.transition = 'transform var(--dur) var(--ease)'
      el.style.transform = ''
    }
    tops.current = next
  }, [items])

  return (
    <div className="flex flex-col">
      {items.map((it) => (
        // Outer element carries the slide (FLIP transform); the inner one the fade-in, so they don't fight
        <div
          key={it.id}
          ref={(el) => {
            if (el) els.current.set(it.id, el)
            else els.current.delete(it.id)
          }}
        >
          <div className={initial.has(it.id) ? '' : 'la-7'}>{render(it)}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * "Roll up to header": the bottom edge slides up until only the element marked `data-roll-keep`
 * (and what is above it) remains; restoring slides it back down. Works for fixed-height and
 * content-height panels alike.
 */
export function RollUp({ minimized, children, className = '' }: { minimized: boolean; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const openH = useRef(0)
  const first = useRef(true)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (first.current) {
      first.current = false
      if (!minimized) return
    }
    const scroller = el.querySelector<HTMLElement>('.overflow-y-auto')
    const done = () => {
      if (!minimized) {
        el.style.height = ''
        el.style.overflow = ''
      }
    }
    el.style.transition = 'none'
    if (minimized) {
      openH.current = el.offsetHeight
      const keep = el.querySelector<HTMLElement>('[data-roll-keep]')
      const fill = el.querySelector<HTMLElement>('.fr-fill')
      const padB = fill ? parseFloat(getComputedStyle(fill).paddingBottom) : 12
      // A keep block inside the scroller is measured as if scrolled to the top
      const scrolled = keep && scroller?.contains(keep) ? scroller.scrollTop : 0
      // "flush": end right on the keep block's bottom edge (its divider line), no padding below
      const flush = keep?.dataset.rollKeep === 'flush'
      const minH = keep ? keep.getBoundingClientRect().bottom - el.getBoundingClientRect().top + scrolled + (flush ? 0 : padB + 2) : 56
      scroller?.scrollTo({ top: 0, behavior: 'smooth' })
      el.style.height = `${el.offsetHeight}px`
      el.style.overflow = 'hidden'
      void el.offsetHeight
      el.style.transition = 'height var(--dur) var(--ease)'
      el.style.height = `${minH}px`
    } else {
      el.style.height = `${el.offsetHeight}px`
      void el.offsetHeight
      el.style.transition = 'height var(--dur) var(--ease)'
      el.style.height = `${openH.current || el.scrollHeight}px`
    }
    el.addEventListener('transitionend', done, { once: true })
    return () => el.removeEventListener('transitionend', done)
  }, [minimized])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
