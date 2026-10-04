import { useEffect, useState } from 'react'
import { Cartesian3, Math as CMath } from 'cesium'
import { GlobeHUD } from '../../gui_elements/Composites'
import { useDesign } from '../../gui_elements/context'
import { FLIGHTS } from '../../gui_elements/flights'
import { GlobeControls } from '../../gui_elements/GlobeControls'
import { useNow } from '../ui/useNow'
import { useGlobeUi } from './globeUi'
import { useViewer } from './viewerContext'
import { shellGeometry } from '../ui/shell'
import { attachPlaces } from './places'
import { attachWheelZoom } from './wheelZoom'

const HOME = { lon: 15, lat: 30, height: 20_000_000 }
// Zoom as a percentage on a log scale: 0% = the whole globe (home view), 100% = 1 km up
const CLOSEST = 1_000
const span = Math.log(CLOSEST / HOME.height)
const heightFor = (pct: number) => HOME.height * Math.exp((pct / 100) * span)
const zoomFor = (h: number) => Math.min(100, Math.max(0, (Math.log(h / HOME.height) / span) * 100))

/**
 * Position readout (top right, beside ANALYSIS) and the globe control strip (bottom centre),
 * driving the Cesium camera. Both are fixed to the screen: they never move with the panels.
 */
export function GlobeOverlay() {
  const viewer = useViewer()!
  const now = useNow(1000)
  const design = useDesign()
  const flight = FLIGHTS[design.flyto].dur / 1000
  const right = shellGeometry(design).right
  const places = useGlobeUi((s) => s.places)
  const togglePlaces = useGlobeUi((s) => s.togglePlaces)
  const sky = useGlobeUi((s) => s.sky)
  const toggleSky = useGlobeUi((s) => s.toggleSky)
  const [cam, setCam] = useState({ lat: HOME.lat, lon: HOME.lon, height: HOME.height })
  const [spin, setSpin] = useState(false)
  const [tilt, setTilt] = useState(false)

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
        setCam({ lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude), height: c.height })
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

  const flyTo = (lon: number, lat: number, height: number, pitchDeg = tilt ? -35 : -90, heading = viewer.camera.heading) =>
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, height),
      orientation: { heading, pitch: CMath.toRadians(pitchDeg), roll: 0 },
      duration: flight,
    })

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
      <div className="pointer-events-auto fixed bottom-3 left-1/2 z-[5] -translate-x-1/2">
        <GlobeControls
          zoom={Math.round(zoomFor(cam.height) * 10) / 10}
          minZoom={0}
          maxZoom={100}
          onZoom={(z) => flyTo(cam.lon, cam.lat, heightFor(z))}
          onRotate={rotate}
          onNorth={() => flyTo(cam.lon, cam.lat, cam.height, tilt ? -35 : -90, 0)}
          tilt={tilt}
          onTilt={() => {
            flyTo(cam.lon, cam.lat, cam.height, tilt ? -90 : -35)
            setTilt(!tilt)
          }}
          playing={spin}
          onPlay={() => setSpin(!spin)}
          places={places}
          onPlaces={togglePlaces}
          sky={sky}
          onSky={toggleSky}
          onHome={() => {
            setSpin(false)
            setTilt(false)
            flyTo(HOME.lon, HOME.lat, HOME.height, -90, 0)
          }}
        />
      </div>
    </>
  )
}
