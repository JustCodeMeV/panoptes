// Mock globe for the design editor only (the app renders the globe with Cesium). It shows the chosen
// globe style, pins, clusters, selected-pin treatment, event flash and fly-to feel.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { geoContains, geoDistance, geoGraticule, geoGraticule10, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { feature } from 'topojson-client'
import land110 from 'world-atlas/land-110m.json'
import { useArgusControls, useDesign } from '../../gui_elements/context'
import { MarkerGlyph, type Precision } from '../../gui_elements/Controls'
import { DEMO_CLUSTERS, DEMO_PINS } from './demo'
import { FLIGHTS } from '../../gui_elements/flights'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = land110 as any
const LAND = feature(topo, topo.objects.land) as unknown as GeoPermissibleObjects

export type GlobePin = { id: string; name: string; lon: number; lat: number; p: Precision; layer: number; viewers: string }
export type GlobeCluster = { id: string; lon: number; lat: number; counts: number[] }

/** Land sampled as a dot grid (computed once). */
let dots: [number, number][] | null = null
function landDots() {
  if (dots) return dots
  dots = []
  for (let lat = -78; lat <= 82; lat += 2.6)
    for (let lon = -180; lon < 180; lon += 2.6 / Math.max(0.25, Math.cos((lat * Math.PI) / 180)))
      if (geoContains(LAND, [lon, lat])) dots.push([lon, lat])
  return dots
}

type Style = { ocean: string; outline: string; grid: string | null; gridFine?: boolean; land: 'line' | 'fill' | 'dots' | 'topo' | 'night' | 'heat'; landFill?: string; landStroke?: string; glow?: boolean; scan?: boolean }
const a2 = (p: number) => `color-mix(in srgb, var(--color-accent-2) ${p}%, transparent)`
const STYLES: Style[] = [
  { ocean: 'var(--color-bg)', outline: a2(90), grid: a2(14), land: 'line', landStroke: a2(75) },
  { ocean: 'var(--color-bg)', outline: a2(50), grid: null, land: 'dots', landFill: a2(75) },
  { ocean: 'color-mix(in srgb, var(--color-bg) 70%, black)', outline: 'var(--color-line)', grid: null, land: 'fill', landFill: 'var(--color-line)', landStroke: 'color-mix(in srgb, var(--color-dim) 40%, transparent)' },
  { ocean: a2(8), outline: a2(100), grid: a2(18), land: 'fill', landFill: a2(16), landStroke: a2(95), glow: true, scan: true },
  { ocean: 'var(--color-bg)', outline: a2(60), grid: a2(7), gridFine: true, land: 'topo', landStroke: a2(80) },
  { ocean: '#03050a', outline: 'rgba(255,210,122,.25)', grid: null, land: 'night', landFill: '#0b0f14' },
  { ocean: '#0b2a4a', outline: 'rgba(255,255,255,.7)', grid: 'rgba(255,255,255,.18)', land: 'line', landStroke: 'rgba(255,255,255,.85)', landFill: 'rgba(255,255,255,.05)' },
  { ocean: '#0a0606', outline: 'rgba(255,106,0,.5)', grid: null, land: 'heat', landFill: '#1a0f0a', landStroke: 'rgba(255,106,0,.35)' },
  { ocean: '#020a02', outline: '#39ff14', grid: 'rgba(57,255,20,.15)', land: 'fill', landFill: 'rgba(57,255,20,.08)', landStroke: 'rgba(57,255,20,.8)', glow: true, scan: true },
  { ocean: '#8fbcd6', outline: '#ffffff', grid: 'rgba(255,255,255,.35)', land: 'fill', landFill: '#f2f8fc', landStroke: '#ffffff' },
]

const layerColor = (n: number) => `var(--layer-${n})`

type Props = {
  size?: number
  pins?: GlobePin[]
  clusters?: GlobeCluster[]
  /** Cycle the selection through the pins (shows fly-to). */
  autoplay?: boolean
  /** Fire event flashes at random pins. */
  flashes?: boolean
  /** View zoom (1 = whole globe). */
  zoom?: number
  /** Auto-rotate. */
  spin?: boolean
  /** Tilted 3D perspective. */
  tilt?: boolean
  /** Show pins, clusters, selection and flashes. */
  showPins?: boolean
  /** Imperative camera controls for the globe control stack. */
  api?: { current: GlobeApi | null }
  /** Called when the user clicks a pin. */
  onSelect?: (pin: GlobePin) => void
  children?: ReactNode
}

export type GlobeApi = { rotateBy: (deg: number) => void; north: () => void; home: () => void }

const HOME: [number, number] = [-38, -36]

/** Satellite texture (NASA Blue Marble, via the three-globe package on jsDelivr). Loaded once. */
const SAT_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2/example/img/earth-blue-marble.jpg'
let satPixels: Promise<ImageData> | null = null
function loadSatellite() {
  satPixels ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, c.width, c.height))
    }
    img.onerror = reject
    img.src = SAT_URL
  })
  return satPixels
}

/** Satellite imagery reprojected onto the orthographic globe (half resolution, scaled up). */
function SatelliteLayer({ proj, size }: { proj: ReturnType<typeof geoOrthographic>; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [src, setSrc] = useState<ImageData | null>(null)
  useEffect(() => {
    let live = true
    loadSatellite().then((d) => live && setSrc(d)).catch(() => {})
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    const cv = ref.current
    if (!cv || !src) return
    const n = Math.ceil(size / 2)
    cv.width = n
    cv.height = n
    const ctx = cv.getContext('2d')!
    const out = ctx.createImageData(n, n)
    const [cx, cy] = proj.translate()
    const r2 = proj.scale() ** 2
    const { width: W, height: H, data } = src
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const px = x * 2 + 1, py = y * 2 + 1
        if ((px - cx) ** 2 + (py - cy) ** 2 > r2) continue
        const ll = proj.invert!([px, py])
        if (!ll) continue
        const sx = Math.min(W - 1, Math.floor(((ll[0] + 180) / 360) * W))
        const sy = Math.min(H - 1, Math.floor(((90 - ll[1]) / 180) * H))
        const si = (sy * W + sx) * 4, oi = (y * n + x) * 4
        out.data[oi] = data[si]
        out.data[oi + 1] = data[si + 1]
        out.data[oi + 2] = data[si + 2]
        out.data[oi + 3] = 255
      }
    ctx.putImageData(out, 0, 0)
  }, [src, proj, size])
  return <canvas ref={ref} className="absolute inset-0" style={{ width: size, height: size, imageRendering: 'auto' }} />
}

const SATELLITE_STYLE: Style = { ocean: '#02060c', outline: 'rgba(160,210,255,.6)', grid: 'rgba(255,255,255,.06)', land: 'line', landStroke: 'rgba(255,255,255,.28)' }

export function MockGlobe({ size = 240, pins = DEMO_PINS, clusters = DEMO_CLUSTERS, autoplay = false, flashes = true, zoom: view = 1, spin = false, tilt = false, showPins = true, api, onSelect, children }: Props) {
  const d = useDesign()
  const { satellite } = useArgusControls()
  const st = satellite ? SATELLITE_STYLE : STYLES[d.globe]
  const [rot, setRot] = useState<[number, number]>(HOME)
  const [dip, setDip] = useState(1)
  const [sel, setSel] = useState(pins[0]?.id)
  const [flash, setFlash] = useState<{ k: number; id: string } | null>(null)
  const raf = useRef(0)
  const rotRef = useRef(rot)
  rotRef.current = rot

  /** Animate the camera to rotation [lambda, phi] with the design's fly-to feel. */
  const animateTo = (target: [number, number]) => {
    cancelAnimationFrame(raf.current)
    const f = FLIGHTS[d.flyto]
    const [l0, p0] = rotRef.current
    let l1 = target[0]
    while (l1 - l0 > 180) l1 -= 360
    while (l1 - l0 < -180) l1 += 360
    const p1 = target[1]
    if (f.dur === 0) return setRot([l1, p1])
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / f.dur)
      const e = f.ease(t)
      setRot([l0 + (l1 - l0) * e, p0 + (p1 - p0) * e])
      setDip(1 - (1 - f.dip) * Math.sin(Math.PI * Math.min(1, t)))
      if (t < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }
  const flyTo = (pin: GlobePin) => {
    setSel(pin.id)
    animateTo([-pin.lon, -pin.lat * 0.85])
  }
  if (api) api.current = { rotateBy: (deg) => animateTo([rotRef.current[0] + deg, rotRef.current[1]]), north: () => animateTo([rotRef.current[0], 0]), home: () => animateTo(HOME) }

  // Auto-rotate
  useEffect(() => {
    if (!spin) return
    let id = 0
    const step = () => {
      setRot(([l, p]) => [l + 0.18, p])
      id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [spin])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  useEffect(() => {
    if (!autoplay) return
    let i = 0
    const t = setInterval(() => {
      i = (i + 1) % pins.length
      flyTo(pins[i])
    }, 3200)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, d.flyto])

  useEffect(() => {
    if (!flashes || d.flash === 6) return
    let k = 0
    const t = setInterval(() => setFlash({ k: ++k, id: pins[Math.floor(Math.random() * pins.length)].id }), 2300)
    return () => clearInterval(t)
  }, [flashes, d.flash, pins])

  const r = (size / 2 - 10) * dip * view
  const proj = useMemo(() => geoOrthographic().scale(r).translate([size / 2, size / 2]).rotate(rot).clipAngle(90), [r, size, rot])
  const path = geoPath(proj)
  const center: [number, number] = [-rot[0], -rot[1]]
  const front = (lon: number, lat: number) => geoDistance([lon, lat], center) < Math.PI / 2 - 0.05
  const at = (lon: number, lat: number) => proj([lon, lat]) as [number, number]
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), [])
  const selPin = pins.find((p) => p.id === sel)
  const flashPin = flash && pins.find((p) => p.id === flash.id)

  return (
    <div
      className={`gl relative ${view > 1 ? 'overflow-hidden' : ''}`}
      style={{ width: size, height: size, transform: tilt ? 'perspective(900px) rotateX(32deg)' : 'none', transition: 'transform var(--dur) var(--ease)' }}
    >
      {satellite && <SatelliteLayer proj={proj} size={size} />}
      <svg width={size} height={size} className="relative" style={st.glow ? { filter: `drop-shadow(0 0 6px ${st.outline})` } : undefined}>
        <defs>
          <radialGradient id={`heat-${uid}`}>
            <stop offset="0%" stopColor="#ffef5c" stopOpacity=".9" />
            <stop offset="35%" stopColor="#ff6a00" stopOpacity=".6" />
            <stop offset="100%" stopColor="#ff2d55" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`beam-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".9" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`limb-${uid}`}>
            <stop offset="70%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity=".55" />
          </radialGradient>
          <mask id={`spot-${uid}`}>
            <rect width={size} height={size} fill="white" />
            {selPin && front(selPin.lon, selPin.lat) && <circle cx={at(selPin.lon, selPin.lat)[0]} cy={at(selPin.lon, selPin.lat)[1]} r={24} fill="black" />}
          </mask>
        </defs>

        {/* Base */}
        <circle cx={size / 2} cy={size / 2} r={r} style={{ fill: satellite ? `url(#limb-${uid})` : st.ocean, stroke: st.outline }} strokeWidth={1.2} />
        {st.grid && <path d={path(st.gridFine ? geoGraticule().step([5, 5])() : geoGraticule10()) ?? ''} style={{ fill: 'none', stroke: st.grid }} strokeWidth={0.6} />}
        {st.land === 'dots' &&
          landDots().filter(([lo, la]) => front(lo, la)).map(([lo, la], i) => {
            const [x, y] = at(lo, la)
            return <circle key={i} cx={x} cy={y} r={size / 260} style={{ fill: st.landFill }} />
          })}
        {st.land === 'topo' && [7, 4, 1].map((w, i) => <path key={w} d={path(LAND) ?? ''} style={{ fill: 'none', stroke: st.landStroke, opacity: [0.08, 0.18, 0.8][i] }} strokeWidth={w} />)}
        {(st.land === 'line' || st.land === 'fill' || st.land === 'night' || st.land === 'heat') && (
          <path d={path(LAND) ?? ''} style={{ fill: st.landFill ?? 'none', stroke: st.landStroke ?? 'none' }} strokeWidth={0.8} />
        )}
        {st.land === 'night' &&
          landDots().filter(([lo, la], i) => i % 4 === 0 && front(lo, la) && la > -40 && la < 62).map(([lo, la], i) => {
            const [x, y] = at(lo, la)
            return <circle key={i} cx={x} cy={y} r={0.9} style={{ fill: '#ffd27a', opacity: 0.25 + ((i * 37) % 70) / 100 }} />
          })}
        {st.land === 'heat' &&
          pins.filter((p) => front(p.lon, p.lat)).map((p) => {
            const [x, y] = at(p.lon, p.lat)
            return <circle key={p.id} cx={x} cy={y} r={size / 9} fill={`url(#heat-${uid})`} />
          })}

        {/* Clusters */}
        {showPins && clusters.filter((c) => front(c.lon, c.lat)).map((c) => {
          const [x, y] = at(c.lon, c.lat)
          return <Cluster key={c.id} v={d.cluster} x={x} y={y} counts={c.counts} uid={uid} />
        })}

        {/* Pins */}
        {showPins && pins.filter((p) => front(p.lon, p.lat)).map((p) => {
          const [x, y] = at(p.lon, p.lat)
          return (
            <g key={p.id} style={{ cursor: 'pointer' }} onClick={() => { flyTo(p); onSelect?.(p) }}>
              <circle cx={x} cy={y} r={12} fill="transparent" />
              <Pin v={d.pin} x={x} y={y} pin={p} uid={uid} />
            </g>
          )
        })}

        {/* Selection */}
        {showPins && selPin && front(selPin.lon, selPin.lat) && (
          <Selected key={`${sel}-${d.selected}`} v={d.selected} x={at(selPin.lon, selPin.lat)[0]} y={at(selPin.lon, selPin.lat)[1]} pin={selPin} size={size} uid={uid} />
        )}

        {/* Event flash */}
        {showPins && flashPin && front(flashPin.lon, flashPin.lat) && <Flash key={flash!.k} v={d.flash} x={at(flashPin.lon, flashPin.lat)[0]} y={at(flashPin.lon, flashPin.lat)[1]} uid={uid} />}
      </svg>
      {st.scan && <div className="crt pointer-events-none absolute inset-0 rounded-full" />}
      {children}
    </div>
  )
}

function Pin({ v, x, y, pin, uid }: { v: number; x: number; y: number; pin: GlobePin; uid: string }) {
  const c = layerColor(pin.layer)
  switch (v) {
    case 1:
      return <><line x1={x} y1={y} x2={x} y2={y - 16} style={{ stroke: c }} strokeWidth={1} /><circle cx={x} cy={y} r={1.5} style={{ fill: c }} /><MarkerGlyph p={pin.p} x={x} y={y - 18} size={13} color={c} /></>
    case 2:
      return (
        <>
          <MarkerGlyph p={pin.p} x={x} y={y} size={13} color={c} />
          <rect x={x + 8} y={y - 7} width={pin.name.length * 5.4 + 8} height={13} style={{ fill: 'color-mix(in srgb, var(--color-bg) 80%, transparent)', stroke: c }} strokeWidth={0.6} />
          <text x={x + 12} y={y + 2.5} fontSize={8} style={{ fill: 'var(--color-ink)', fontFamily: 'var(--font-sub)', letterSpacing: '0.08em' }}>{pin.name.toUpperCase()}</text>
        </>
      )
    case 3:
      return <><circle cx={x} cy={y} r={10} style={{ fill: c, opacity: 0.2 }} /><circle cx={x} cy={y} r={10} style={{ fill: 'none', stroke: c, opacity: 0.5 }} strokeWidth={0.6} /><MarkerGlyph p={pin.p} x={x} y={y} size={12} color={c} /></>
    case 4:
      return <g style={{ color: c }}><rect x={x - 1.5} y={y - 34} width={3} height={34} fill={`url(#beam-${uid})`} /><MarkerGlyph p={pin.p} x={x} y={y} size={11} color={c} /></g>
    case 5:
      return <><ellipse cx={x} cy={y} rx={9} ry={3.5} style={{ fill: 'none', stroke: c }} strokeWidth={1} /><circle cx={x} cy={y} r={2} style={{ fill: c }} /><MarkerGlyph p={pin.p} x={x} y={y - 9} size={10} color={c} /></>
    case 6:
      return <><polygon points={`${x - 4},${y} ${x},${y - 18} ${x + 4},${y}`} style={{ fill: c, opacity: pin.p === 'inferred' ? 0.5 : 1 }} /><ellipse cx={x} cy={y} rx={5} ry={2} style={{ fill: c, opacity: 0.4 }} /></>
    default:
      return <MarkerGlyph p={pin.p} x={x} y={y} size={14} color={c} />
  }
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
  return `M${p(a0)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`
}

function Cluster({ v, x, y, counts, uid }: { v: number; x: number; y: number; counts: number[]; uid: string }) {
  const n = counts.reduce((a, b) => a + b, 0)
  const text = (dy = 3.5, fill = 'var(--color-ink)', size = 10) => (
    <text x={x} y={y + dy} textAnchor="middle" fontSize={size} fontWeight={600} style={{ fill, fontFamily: 'var(--font-mono)' }}>{n}</text>
  )
  const acc = 'var(--color-accent)'
  switch (v) {
    case 1: {
      const hex = Array.from({ length: 6 }, (_, i) => `${x + 14 * Math.cos((Math.PI / 3) * i)},${y + 14 * Math.sin((Math.PI / 3) * i)}`).join(' ')
      return <><polygon points={hex} style={{ fill: a2(18), stroke: acc }} strokeWidth={1} />{text()}</>
    }
    case 2:
      return <><path d={`M${x - 9},${y - 10}H${x + 14}V${y + 5}L${x + 9},${y + 10}H${x - 14}V${y - 5}Z`} style={{ fill: a2(18), stroke: acc }} strokeWidth={1} />{text()}</>
    case 3: {
      // Segment start angles: each layer's share of the ring, with a small gap between segments
      const starts = counts.map((_, i) => -Math.PI / 2 + (counts.slice(0, i).reduce((a, b) => a + b, 0) / n) * Math.PI * 2)
      return (
        <>
          <circle cx={x} cy={y} r={13} style={{ fill: 'color-mix(in srgb, var(--color-bg) 85%, transparent)' }} />
          {counts.map((c, i) => (
            <path key={i} d={arcPath(x, y, 13, starts[i], starts[i] + (c / n) * Math.PI * 2 - 0.12)} style={{ fill: 'none', stroke: layerColor(i + 1) }} strokeWidth={3} />
          ))}
          {text()}
        </>
      )
    }
    case 4:
      return <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={600} style={{ fill: 'var(--color-ink)', fontFamily: 'var(--font-mono)' }}><tspan style={{ fill: 'var(--color-accent-2)' }}>[</tspan>{n}<tspan style={{ fill: 'var(--color-accent-2)' }}>]</tspan></text>
    case 5:
      return <><circle cx={x} cy={y} r={24} fill={`url(#heat-${uid})`} />{text(3, '#fff', 9)}</>
    case 6:
      return <><rect x={x - 14} y={y - 9} width={28} height={18} style={{ fill: '#000', stroke: a2(50) }} />{text(3.5, acc)}</>
    default:
      return <><circle cx={x} cy={y} r={13} style={{ fill: a2(18), stroke: acc }} strokeWidth={1} />{text()}</>
  }
}

function Selected({ v, x, y, pin, size, uid }: { v: number; x: number; y: number; pin: GlobePin; size: number; uid: string }) {
  const c = 'var(--color-accent)'
  switch (v) {
    case 1:
      return (
        <g className="fx" style={{ animation: 'lock-in var(--dur) var(--ease) both' }}>
          <path d={`M${x - 20},${y}H${x - 8}M${x + 8},${y}H${x + 20}M${x},${y - 20}V${y - 8}M${x},${y + 8}V${y + 20}`} style={{ stroke: c }} strokeWidth={1.4} />
          <circle cx={x} cy={y} r={11} style={{ fill: 'none', stroke: c }} strokeWidth={0.8} />
        </g>
      )
    case 2: {
      const s = 12, l = 5
      return <path d={`M${x - s},${y - s + l}V${y - s}H${x - s + l}M${x + s - l},${y - s}H${x + s}V${y - s + l}M${x + s},${y + s - l}V${y + s}H${x + s - l}M${x - s + l},${y + s}H${x - s}V${y + s - l}`} style={{ fill: 'none', stroke: c }} strokeWidth={1.6} />
    }
    case 3:
      return (
        <g>
          <polyline points={`${x + 4},${y - 4} ${x + 16},${y - 22} ${x + 30},${y - 22}`} style={{ fill: 'none', stroke: c }} strokeWidth={1} />
          <rect x={x + 30} y={y - 31} width={pin.name.length * 6 + 34} height={18} style={{ fill: 'color-mix(in srgb, var(--color-bg) 88%, transparent)', stroke: c }} strokeWidth={0.8} />
          <text x={x + 35} y={y - 19} fontSize={9} style={{ fill: 'var(--color-ink)', fontFamily: 'var(--font-sub)', letterSpacing: '0.08em' }}>{pin.name.toUpperCase()} · {pin.viewers}</text>
        </g>
      )
    case 4:
      return <g style={{ color: 'var(--color-accent)' }}><rect className="fx" x={x - 2.5} y={y - 70} width={5} height={70} fill={`url(#beam-${uid})`} style={{ animation: 'breathe 2s ease-in-out infinite' }} /><circle cx={x} cy={y} r={4} style={{ fill: c }} /></g>
    case 5:
      return (
        <g className="fx" style={{ animation: 'reticle 6s linear infinite' }}>
          <circle cx={x} cy={y} r={15} style={{ fill: 'none', stroke: c }} strokeWidth={1.2} strokeDasharray="6 4" />
          <path d={`M${x},${y - 19}V${y - 15}M${x},${y + 15}V${y + 19}M${x - 19},${y}H${x - 15}M${x + 15},${y}H${x + 19}`} style={{ stroke: c }} strokeWidth={1.4} />
        </g>
      )
    case 6:
      return <rect width={size} height={size} mask={`url(#spot-${uid})`} style={{ fill: 'rgba(0,0,0,.5)', pointerEvents: 'none' }} />
    default:
      return <circle className="fx" cx={x} cy={y} r={9} style={{ fill: 'none', stroke: c, animation: 'ripple 1.6s ease-out infinite' }} strokeWidth={1.5} />
  }
}

function Flash({ v, x, y, uid }: { v: number; x: number; y: number; uid: string }) {
  const c = 'var(--color-live)'
  switch (v) {
    case 1:
      return <circle className="fx" cx={x} cy={y} r={9} style={{ fill: '#fff', animation: 'burst 0.7s ease-out forwards' }} />
    case 2:
      return (
        <g>
          <circle className="fx" cx={x} cy={y} r={14} style={{ fill: 'none', stroke: c, animation: 'ripple 1.2s ease-out forwards' }} />
          <path className="fx" d={arcPath(x, y, 16, -Math.PI / 2, 0)} style={{ fill: 'none', stroke: c, transformOrigin: `${x}px ${y}px`, transformBox: 'view-box', animation: 'ping-arc 1.2s linear forwards' }} strokeWidth={2} />
        </g>
      )
    case 3:
      return (
        <g style={{ animation: 'flicker 0.8s steps(1) forwards' }}>
          <circle cx={x - 2} cy={y} r={5} style={{ fill: '#ff2bd6', opacity: 0.8 }} />
          <circle cx={x + 2} cy={y} r={5} style={{ fill: '#2bfcff', opacity: 0.8 }} />
        </g>
      )
    case 4:
      return <g style={{ color: c }}><rect className="beam" x={x - 2} y={y - 60} width={4} height={60} fill={`url(#beam-${uid})`} style={{ animation: 'beam-up 1s ease-out forwards' }} /></g>
    case 5:
      return <circle className="fx" cx={x} cy={y} r={8} style={{ fill: 'none', stroke: c, animation: 'shock 1.4s ease-out forwards' }} strokeWidth={0.6} />
    default:
      return (
        <g>
          {[0, 0.25, 0.5].map((dl) => (
            <circle key={dl} className="fx" cx={x} cy={y} r={7} style={{ fill: 'none', stroke: c, animation: `ripple 1.3s ease-out ${dl}s both` }} strokeWidth={1.4} />
          ))}
        </g>
      )
  }
}
