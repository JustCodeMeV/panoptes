import { useEffect, useRef } from 'react'
import { Cartesian3, SceneTransforms } from 'cesium'
import type { Feature } from '../../shared/feature'
import { useSelected } from '../core/store'
import { LAYERS } from '../layers'
import { useViewer } from './viewerContext'

/**
 * The map comes alive around the open story: water flowing out (flood) or drawing back
 * (drought), a targeting lock for military action, and a sonar ping for everything else.
 * Drawn in HTML/SVG over the canvas and pinned to the story's spot, so it costs the globe nothing.
 */

type Fx = 'flood' | 'drought' | 'military' | 'ping'

const WATER = /\b(flood|flooding|floods|tsunami|cyclone|typhoon|hurricane|storm surge|monsoon|dam burst)\b/i
const DRY = /\b(drought|famine|water shortage|heatwave)\b/i
const MILITARY = /\b(strike|strikes|missile|missiles|shelling|airstrike|drone|drones|troops|artillery|military|bombing|bombed|offensive|frontline|battle|clashes|army|navy|warship|rocket|rockets)\b/i
const MILITARY_LAYERS = new Set(['acled', 'military', 'frontlines'])

function classify(f: Feature): Fx {
  const category = String(f.props.category ?? '')
  const text = `${category} ${f.title}`
  if (/drought/.test(category) || DRY.test(text)) return 'drought'
  if (/flood|tsunami|cyclone|storm/.test(category) || WATER.test(text)) return 'flood'
  if (MILITARY_LAYERS.has(f.layerId) || MILITARY.test(text)) return 'military'
  return 'ping'
}

const SIZE = 240
const C = SIZE / 2

/** A ring whose radius ripples like a wave front. */
function wavePath(r: number, amp: number, lobes: number) {
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2
    const rr = r + Math.sin(a * lobes) * amp
    pts.push(`${(C + Math.cos(a) * rr).toFixed(1)},${(C + Math.sin(a) * rr).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

function Water({ dry }: { dry: boolean }) {
  const color = dry ? '#e0a050' : '#4fa8ff'
  return (
    <svg width={SIZE} height={SIZE} className={dry ? 'fx-recede' : 'fx-flow'} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={wavePath(26, 3, 9)} fill="none" stroke={color} strokeWidth="1.6" className="fx-wave" style={{ animationDelay: `${i * 0.75}s` }} />
      ))}
      {/* Currents: dashed arcs streaming around the spot */}
      {[44, 62, 80].map((r, i) => (
        <circle key={r} cx={C} cy={C} r={r} fill="none" stroke={color} strokeOpacity={0.55 - i * 0.12} strokeWidth="1.2" strokeDasharray="14 22" className="fx-current" style={{ animationDuration: `${6 + i * 2}s` }} />
      ))}
      <circle cx={C} cy={C} r="5" fill={color} opacity="0.9" />
    </svg>
  )
}

function Military() {
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2
    const r1 = 92
    const r2 = i % 9 === 0 ? 82 : 87
    return <line key={i} x1={C + Math.cos(a) * r1} y1={C + Math.sin(a) * r1} x2={C + Math.cos(a) * r2} y2={C + Math.sin(a) * r2} />
  })
  const corner = (sx: number, sy: number) => `M${C + sx * 30} ${C + sy * 18}V${C + sy * 30}H${C + sx * 18}`
  return (
    <svg width={SIZE} height={SIZE} className="fx-mil" aria-hidden>
      <defs>
        <radialGradient id="fx-sweep-fade">
          <stop offset="0" stopColor="var(--color-alert)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--color-alert)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Radar sweep */}
      <g className="fx-spin" style={{ animationDuration: '3.2s' }}>
        <path d={`M${C} ${C}L${C + 92} ${C}A92 92 0 0 0 ${C + 92 * Math.cos(-0.7)} ${C + 92 * Math.sin(-0.7)}Z`} fill="url(#fx-sweep-fade)" />
      </g>
      <g stroke="var(--color-alert)" strokeOpacity="0.6" strokeWidth="1.2" className="fx-spin-rev" style={{ animationDuration: '24s' }}>
        {ticks}
      </g>
      <circle cx={C} cy={C} r="60" fill="none" stroke="var(--color-alert)" strokeOpacity="0.35" strokeDasharray="2 6" />
      {/* Crosshair with a gap at the centre */}
      <path d={`M${C - 70} ${C}H${C - 12}M${C + 12} ${C}H${C + 70}M${C} ${C - 70}V${C - 12}M${C} ${C + 12}V${C + 70}`} stroke="var(--color-alert)" strokeWidth="1.2" strokeOpacity="0.8" />
      {/* Lock-on brackets close in, then hold */}
      <g fill="none" stroke="var(--color-alert)" strokeWidth="2" className="fx-lock">
        {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => <path key={`${sx}${sy}`} d={corner(sx, sy)} />)}
      </g>
      <rect x={C - 3} y={C - 3} width="6" height="6" fill="var(--color-alert)" className="fx-blink" />
      <text x={C + 36} y={C - 36} fill="var(--color-alert)" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1.5" className="fx-blink">TGT LOCK</text>
    </svg>
  )
}

function Ping({ color }: { color: string }) {
  return (
    <svg width={SIZE} height={SIZE} aria-hidden>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={C} cy={C} r="80" fill="none" stroke={color} strokeWidth="2" className="fx-ping" style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
      <rect x={C - 7} y={C - 7} width="14" height="14" fill="none" stroke={color} strokeWidth="1.5" className="fx-spin" style={{ animationDuration: '4s', transformOrigin: `${C}px ${C}px` }} />
    </svg>
  )
}

/** Effect for the open story, following it on screen and hidden when it's behind the Earth. */
export function SelectionFx() {
  const viewer = useViewer()!
  const feature = useSelected()
  const box = useRef<HTMLDivElement>(null)
  const pos = feature?.position

  useEffect(() => {
    if (!pos) return
    const world = Cartesian3.fromDegrees(pos.lon, pos.lat)
    const up = Cartesian3.normalize(world, new Cartesian3())
    const place = () => {
      const el = box.current
      if (!el) return
      const toCam = Cartesian3.normalize(Cartesian3.subtract(viewer.camera.positionWC, world, new Cartesian3()), new Cartesian3())
      const xy = SceneTransforms.worldToWindowCoordinates(viewer.scene, world)
      const visible = !!xy && Cartesian3.dot(up, toCam) > 0
      el.style.opacity = visible ? '1' : '0'
      if (xy) el.style.transform = `translate(${xy.x - C}px, ${xy.y - C}px)`
    }
    place()
    viewer.scene.requestRender()
    return viewer.scene.postRender.addEventListener(place)
  }, [viewer, pos])

  if (!feature || !pos) return null
  const fx = classify(feature)
  const def = LAYERS.find((d) => d.id === feature.layerId)
  const color = def?.pin(feature).color ?? def?.color ?? 'var(--color-accent-2)'
  return (
    <div ref={box} key={feature.id} className="pointer-events-none absolute top-0 left-0 z-[4] transition-opacity duration-200" style={{ width: SIZE, height: SIZE, opacity: 0 }}>
      {fx === 'military' ? <Military /> : fx === 'ping' ? <Ping color={color} /> : <Water dry={fx === 'drought'} />}
    </div>
  )
}
