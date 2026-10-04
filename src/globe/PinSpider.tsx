import { useEffect, useMemo, useState } from 'react'
import type { Feature } from '../../shared/feature'
import { featuresOf, useStore } from '../core/store'
import type { LayerDef } from '../core/types'
import { LAYERS } from '../layers'
import { useGlobeUi } from './globeUi'
import { pinImage } from './pins'
import { useViewer } from './viewerContext'

// Pins fan out to a ring: every pin the same distance from the spot, about 32 px apart
const GAP = 32
const MIN_RADIUS = 38
const SLIDE_MS = 200
const PIN = 22

function lookup(ids: string[]): { f: Feature; def: LayerDef }[] {
  const { layers } = useStore.getState()
  const out: { f: Feature; def: LayerDef }[] = []
  for (const id of ids)
    for (const def of LAYERS) {
      const f = featuresOf(layers[def.id]).find((x) => x.id === id)
      if (f) {
        out.push({ f, def })
        break
      }
    }
  return out
}

/**
 * A hovered cluster fanned out: its pins slide out to an even ring around the spot, tied to
 * it by thin lines, each one hoverable (tooltip) and clickable. Moving the mouse away (or the
 * camera) slides them back into the cluster.
 */
export function PinSpider() {
  const spider = useGlobeUi((s) => s.spider)
  const setSpider = useGlobeUi((s) => s.setSpider)
  const select = useStore((s) => s.select)
  const viewer = useViewer()!
  const [out, setOut] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const items = useMemo(() => (spider ? lookup(spider.ids) : []), [spider])

  // Slide out on the frame after mounting, so the transition runs
  useEffect(() => {
    if (!spider) return
    const id = requestAnimationFrame(() => setOut(true))
    return () => {
      cancelAnimationFrame(id)
      setOut(false)
      setHover(null)
    }
  }, [spider])

  const close = () => {
    setOut(false)
    setTimeout(() => {
      // Only clear if no other cluster opened meanwhile
      if (useGlobeUi.getState().spider === spider) setSpider(null)
    }, SLIDE_MS)
  }

  // Any camera move closes it (the cluster itself may regroup)
  useEffect(() => {
    if (!spider) return
    return viewer.camera.moveStart.addEventListener(() => setSpider(null))
  }, [viewer, spider, setSpider])

  if (!spider || !items.length) return null
  const n = items.length
  const radius = Math.max(MIN_RADIUS, (n * GAP) / (2 * Math.PI))
  const hit = radius + PIN

  return (
    <div
      className="absolute z-[5] rounded-full"
      style={{ left: spider.x - hit, top: spider.y - hit, width: hit * 2, height: hit * 2 }}
      onPointerLeave={close}
    >
      {items.map(({ f, def }, i) => {
        const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
        const dx = Math.cos(angle) * radius
        const dy = Math.sin(angle) * radius
        const color = def.pin(f).color ?? def.color
        const ease = `transform ${SLIDE_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${SLIDE_MS}ms`
        return (
          <div key={f.id}>
            {/* Tether back to the spot */}
            <span
              className="pointer-events-none absolute h-px origin-left"
              style={{
                left: hit,
                top: hit,
                width: radius,
                background: color,
                opacity: out ? 0.9 : 0,
                boxShadow: `0 0 4px ${color}`,
                transform: `rotate(${angle}rad) scaleX(${out ? 1 : 0})`,
                transition: ease,
              }}
            />
            <button
              type="button"
              aria-label={`${def.label}: ${f.title}`}
              onPointerEnter={() => setHover(f.id)}
              onPointerLeave={() => setHover((h) => (h === f.id ? null : h))}
              onClick={() => {
                select(f.id)
                setSpider(null)
              }}
              className="absolute grid cursor-pointer place-items-center"
              style={{
                left: hit - PIN / 2,
                top: hit - PIN / 2,
                width: PIN,
                height: PIN,
                opacity: out ? 1 : 0,
                transform: out ? `translate(${dx}px, ${dy}px)` : 'translate(0, 0) scale(0.4)',
                transition: ease,
              }}
            >
              {/* Same image and size as the pin on the globe (drawn 2×, shown at 0.6) */}
              <img
                src={pinImage(color, def.pin(f).size, f.geoPrecision, hover === f.id, def.pin(f).glyph)}
                alt=""
                className="pointer-events-none max-w-none"
                style={{ width: (def.pin(f).size + (hover === f.id ? 28 : 16)) * 1.2 }}
              />
            </button>
            {hover === f.id && out && (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-10 w-60 border border-line bg-bg/95 px-2.5 py-2 shadow-lg"
                style={{
                  left: hit + dx + (dx >= 0 ? PIN / 2 + 8 : -PIN / 2 - 8 - 240),
                  top: hit + dy - 14,
                }}
              >
                <div className="sub t-caption flex items-center gap-1.5" style={{ color }}>
                  <span className="size-2 flex-none" style={{ background: color }} />
                  {def.label}
                </div>
                <div className="mt-1 line-clamp-3 text-[13px] leading-snug text-ink">{f.title}</div>
                {def.subtitle(f) && <div className="sub t-caption mt-1 truncate text-dim">{def.subtitle(f)}</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
