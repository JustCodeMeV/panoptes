import { useEffect, useRef } from 'react'
import { Camera, Cartesian3, HeadingPitchRange, Math as CMath, Matrix4, PerspectiveFrustum, type Viewer } from 'cesium'
import { GlobeHost } from '../globe/GlobeHost'
import { LayerRenderer } from '../globe/LayerRenderer'
import { useViewer } from '../globe/viewerContext'
import { LAYERS } from '../layers'
import type { Spot } from './useGeoIp'

// The view from the ISS cupola: high above the visitor, looking out over them to the horizon
const PITCH = -21
const RANGE = 2_600_000
const FOV = 95
// Slow eastward drift, like the station's orbit (radians per frame)
const DRIFT = 0.00003

function issPose(viewer: Viewer, spot: Spot) {
  const c = new Camera(viewer.scene)
  c.lookAt(Cartesian3.fromDegrees(spot.lon, spot.lat), new HeadingPitchRange(0, CMath.toRadians(PITCH), RANGE))
  c.lookAtTransform(Matrix4.IDENTITY)
  return { destination: c.positionWC.clone(), orientation: { direction: c.directionWC.clone(), up: c.upWC.clone() } }
}

/** Drag turns the globe; zoom, tilt, look and pan are off. A wide lens bends the horizon. */
function lockControls(viewer: Viewer) {
  const ctl = viewer.scene.screenSpaceCameraController
  ctl.enableZoom = false
  ctl.enableTilt = false
  ctl.enableLook = false
  ctl.enableTranslate = false
  if (viewer.camera.frustum instanceof PerspectiveFrustum) viewer.camera.frustum.fov = CMath.toRadians(FOV)
}

/** Fixed ISS-style camera: drag to turn the globe, no zoom, tilt or navigation. Drifts while on screen. */
function IssCamera({ spot, active, onReady }: { spot: Spot; active: boolean; onReady: () => void }) {
  const viewer = useViewer()!
  const placed = useRef(false)

  useEffect(() => lockControls(viewer), [viewer])

  // Tell the page once the first imagery is on screen, so it can fade the view in
  useEffect(() => {
    const globe = viewer.scene.globe
    return globe.tileLoadProgressEvent.addEventListener((queued: number) => {
      if (queued === 0 && globe.tilesLoaded) onReady()
    })
  }, [viewer, onReady])

  // Centre on the visitor; glide there if the IP lookup lands after the first view
  useEffect(() => {
    const pose = issPose(viewer, spot)
    if (placed.current) viewer.camera.flyTo({ ...pose, duration: 2.5 })
    else viewer.camera.setView(pose)
    placed.current = true
    viewer.scene.requestRender()
  }, [viewer, spot])

  useEffect(() => {
    if (!active) return
    let id = 0
    const step = () => {
      viewer.camera.rotate(Cartesian3.UNIT_Z, -DRIFT)
      viewer.scene.requestRender()
      id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [viewer, active])

  return null
}

/** Live ATLAS globe for the landing hero: satellite view, the real sky, the engine's pins. */
export default function LandingGlobe({ spot, active, onReady }: { spot: Spot; active: boolean; onReady: () => void }) {
  return (
    <GlobeHost satellite sky darkSide={false}>
      <LayerRenderer layers={LAYERS} interactive={false} />
      <IssCamera spot={spot} active={active} onReady={onReady} />
    </GlobeHost>
  )
}
