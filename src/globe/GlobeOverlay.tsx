import { useEffect, useState } from 'react'
import { Cartesian3, Math as CMath } from 'cesium'
import { GlobeHUD } from '../../gui_elements/Composites'
import { useDesign } from '../../gui_elements/context'
import { FLIGHTS } from '../../gui_elements/flights'
import { GlobeControls } from '../../gui_elements/GlobeControls'
import { useNow } from '../ui/useNow'
import { useGlobeUi } from './globeUi'
import { useViewer } from './viewerContext'
import { SensorModes } from './sensor/SensorModes'

const HOME = { lon: 15, lat: 30, height: 20_000_000 }
// Zoom readout Z1–Z4 maps to camera height: Z1 = whole globe, each step ×4 closer
const MIN_Z = 1
const MAX_Z = 4
const heightFor = (z: number) => HOME.height / 4 ** (z - 1)
const zoomFor = (h: number) => Math.min(MAX_Z, Math.max(MIN_Z, 1 + Math.log(HOME.height / h) / Math.log(4)))

/** Position readout (bottom-left) and the globe control stack (bottom-right), driving the Cesium camera. */
export function GlobeOverlay() {
  const viewer = useViewer()!
  const now = useNow(1000)
  const flight = FLIGHTS[useDesign().flyto].dur / 1000
  const pinsHidden = useGlobeUi((s) => s.pinsHidden)
  const togglePins = useGlobeUi((s) => s.togglePins)
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
    <div className="pointer-events-none absolute inset-0">
      <GlobeHUD lat={cam.lat} lon={cam.lon} altKm={cam.height / 1000} time={new Date(now)} />
      <div className="pointer-events-auto absolute right-[76px] bottom-3">
        <SensorModes />
      </div>
      <div className="pointer-events-auto absolute right-3 bottom-3">
        <GlobeControls
          zoom={Math.round(zoomFor(cam.height) * 10) / 10}
          minZoom={MIN_Z}
          maxZoom={MAX_Z}
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
          layersOn={!pinsHidden}
          onLayers={togglePins}
          sky={sky}
          onSky={toggleSky}
          onHome={() => {
            setSpin(false)
            setTilt(false)
            flyTo(HOME.lon, HOME.lat, HOME.height, -90, 0)
          }}
        />
      </div>
    </div>
  )
}
