import { useEffect, useRef, useState } from 'react'
import { BoundingSphere, Cartesian2, Cartesian3, HeadingPitchRange, Math as CMath, Matrix4, Transforms, type Viewer } from 'cesium'
import { GlobeHUD } from '../../gui_elements/Composites'
import { useDesign } from '../../gui_elements/context'
import { FLIGHTS } from '../../gui_elements/flights'
import { GlobeControls } from '../../gui_elements/GlobeControls'
import { useNow } from '../ui/useNow'
import { HOME, useGlobeUi } from './globeUi'
import { useViewer } from './viewerContext'
import { shellGeometry, useShell } from '../ui/shell'
import { attachPlaces } from './places'
import { attachWheelZoom } from './wheelZoom'

// Zoom as a percentage on a log scale: 0% = the whole globe (home view), 100% = 1 km up
const CLOSEST = 1_000
const span = Math.log(CLOSEST / HOME.height)
const heightFor = (pct: number) => HOME.height * Math.exp((pct / 100) * span)
const zoomFor = (h: number) => Math.min(100, Math.max(0, (Math.log(h / HOME.height) / span) * 100))
// The 3D view's pitch, seen from the ground it looks at; anything flatter than STRAIGHT counts as tilted
const TILT = CMath.toRadians(-35)
const STRAIGHT = CMath.toRadians(-80)
// Space kept between the control strip and a side panel
const GAP = 8

/**
 * The view as seen from the globe point at its centre: that point, and the heading and pitch of
 * the view there. Zoom, tilt and north-up all turn on this point, not the point under the camera:
 * the two differ once the view is tilted, and pivoting on the wrong one swings the view across
 * instead of zooming. (From far out a 35° tilt is only ~12° at the camera itself, so the pitch is
 * measured here too.) Off the globe, looking at the horizon: the point under the camera.
 */
function viewCentre(viewer: Viewer) {
  const { camera, canvas } = viewer.scene
  const c = camera.positionCartographic
  // The canvas is centred on the free area between the panels, so its centre is the view's
  const target = camera.pickEllipsoid(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)) ?? Cartesian3.fromRadians(c.longitude, c.latitude, 0)
  const toLocal = Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(target), new Matrix4())
  const d = Matrix4.multiplyByPointAsVector(toLocal, camera.directionWC, new Cartesian3())
  // Looking straight down the direction has no heading: the top of the screen gives it
  const h = Math.abs(d.z) > 0.999 ? Matrix4.multiplyByPointAsVector(toLocal, camera.upWC, new Cartesian3()) : d
  return { target, heading: Math.atan2(h.x, h.y), pitch: Math.asin(CMath.clamp(d.z, -1, 1)) }
}

/**
 * Position readout (top right, beside ANALYSIS) and the globe control strip (bottom centre),
 * driving the Cesium camera. Both are fixed to the screen: they never move with the panels.
 */
export function GlobeOverlay() {
  const viewer = useViewer()!
  const now = useNow(1000)
  const design = useDesign()
  const flight = FLIGHTS[design.flyto].dur / 1000
  const geo = shellGeometry(design)
  const right = geo.right
  const leftMin = useShell((s) => s.leftMin)
  const toolOut = useShell((s) => s.toolOut)
  const places = useGlobeUi((s) => s.places)
  const togglePlaces = useGlobeUi((s) => s.togglePlaces)
  const sky = useGlobeUi((s) => s.sky)
  const toggleSky = useGlobeUi((s) => s.toggleSky)
  const [cam, setCam] = useState({ lat: HOME.lat, lon: HOME.lon, height: HOME.height, tilted: false })
  const [spin, setSpin] = useState(false)
  const strip = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)

  // Live camera readout
  useEffect(() => {
    const camera = viewer.camera
    // At most one React update per frame, however often the camera reports a change.
    let raf = 0
    const read = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const c = camera.positionCartographic
        // Tilt is read from the camera itself: story and search flights, and Cesium's own tilt gesture, change it too
        setCam({ lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude), height: c.height, tilted: viewCentre(viewer).pitch > STRAIGHT })
      })
    }
    read()
    const off = [camera.changed.addEventListener(read), camera.moveEnd.addEventListener(read)]
    return () => {
      cancelAnimationFrame(raf)
      off.forEach((remove) => remove())
    }
  }, [viewer])

  useEffect(() => attachWheelZoom(viewer), [viewer])
  useEffect(() => (places ? attachPlaces(viewer) : undefined), [viewer, places])

  // Fly requests from outside the globe (investigation canvas)
  useEffect(() => {
    const on = (e: Event) => {
      const { lat, lon } = (e as CustomEvent<{ lat: number; lon: number }>).detail
      viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(lon, lat, 600_000), duration: flight })
    }
    window.addEventListener('panoptes:flyto', on)
    return () => window.removeEventListener('panoptes:flyto', on)
  }, [viewer, flight])

  // Space bar starts and pauses auto-rotate (not while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      setSpin((on) => !on)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Auto-rotate
  useEffect(() => {
    if (!spin) return
    let id = 0
    const step = () => {
      viewer.camera.rotate(Cartesian3.UNIT_Z, -0.0025)
      viewer.scene.requestRender()
      id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [spin, viewer])

  // On narrow screens the strip shrinks to fit between the side panels instead of sliding under them
  const sideL = leftMin ? 0 : geo.left.inset + geo.left.width
  const sideR = toolOut ? 0 : right.inset + right.width
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const measure = () => setFit(Math.min(1, (window.innerWidth - 2 * (Math.max(sideL, sideR) + GAP)) / el.offsetWidth))
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [sideL, sideR])

  /**
   * Moves along the line to the centre of the view, still looking the same way (the same world
   * direction, not the same local pitch, which changes as the camera crosses the curved Earth).
   * Straight down, that's straight down.
   */
  const zoomTo = (pct: number) => {
    const camera = viewer.camera
    camera.flyTo({
      destination: Cartesian3.lerp(viewCentre(viewer).target, camera.positionWC, heightFor(pct) / camera.positionCartographic.height, new Cartesian3()),
      orientation: { direction: Cartesian3.clone(camera.directionWC), up: Cartesian3.clone(camera.upWC) },
      duration: flight,
    })
  }

  /** Turns the camera around the centre of the view, at the same distance: `turn` sets the new heading and pitch there. */
  const orbit = (turn: (v: { heading: number; pitch: number }) => { heading: number; pitch: number }) => {
    const v = viewCentre(viewer)
    const { heading, pitch } = turn(v)
    viewer.camera.flyToBoundingSphere(new BoundingSphere(v.target, 0), {
      offset: new HeadingPitchRange(heading, pitch, Cartesian3.distance(viewer.camera.positionWC, v.target)),
      duration: flight,
    })
  }

  const rotate = (dir: -1 | 1) => {
    // Orbit 30° around the Earth's axis, eased over the design's flight time
    const total = CMath.toRadians(30) * -dir
    const ms = Math.max(200, flight * 1000)
    const t0 = performance.now()
    let done = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const target = total * (1 - (1 - k) ** 3)
      viewer.camera.rotate(Cartesian3.UNIT_Z, target - done)
      done = target
      viewer.scene.requestRender()
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  return (
    <>
      <GlobeHUD
        className="pointer-events-none fixed z-[5]"
        style={{ top: right.top, right: right.inset + right.width + 12 }}
        lat={cam.lat}
        lon={cam.lon}
        altKm={cam.height / 1000}
        time={new Date(now)}
      />
      <div ref={strip} className="pointer-events-auto fixed bottom-3 left-1/2 z-[5] -translate-x-1/2 origin-bottom" style={fit < 1 ? { scale: String(fit) } : undefined}>
        <GlobeControls
          zoom={Math.round(zoomFor(cam.height) * 10) / 10}
          minZoom={0}
          maxZoom={100}
          onZoom={zoomTo}
          onRotate={rotate}
          onNorth={() => orbit((v) => ({ heading: 0, pitch: v.pitch }))}
          tilt={cam.tilted}
          onTilt={() => orbit((v) => ({ heading: v.heading, pitch: v.pitch > STRAIGHT ? -CMath.PI_OVER_TWO : TILT }))}
          playing={spin}
          onPlay={() => setSpin(!spin)}
          places={places}
          onPlaces={togglePlaces}
          sky={sky}
          onSky={toggleSky}
          onHome={() => {
            setSpin(false)
            viewer.camera.flyTo({
              destination: Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height),
              orientation: { heading: 0, pitch: -CMath.PI_OVER_TWO, roll: 0 },
              duration: flight,
            })
          }}
        />
      </div>
    </>
  )
}
