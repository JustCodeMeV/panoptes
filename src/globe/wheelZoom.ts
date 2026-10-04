import { Cartesian2, Cartesian3, CameraEventType, type Viewer } from 'cesium'

// One mouse-wheel notch (100 px) zooms by about 30%, like a standard web map; trackpads send
// many small deltas and get the same speed, smoothly.
const PER_PIXEL = 0.0026
// Each frame applies this share of what's left, so notches glide instead of jumping
const EASE = 0.3
const MIN_HEIGHT = 300
const MAX_HEIGHT = 45_000_000

/**
 * Replaces Cesium's wheel zoom (very slow on a far-out globe) with map-style zoom toward the
 * cursor. Right-drag and pinch zoom stay Cesium's. Returns a cleanup.
 */
export function attachWheelZoom(viewer: Viewer): () => void {
  const ctl = viewer.scene.screenSpaceCameraController
  const before = ctl.zoomEventTypes
  ctl.zoomEventTypes = [CameraEventType.RIGHT_DRAG, CameraEventType.PINCH]
  const canvas = viewer.scene.canvas
  const cursor = new Cartesian2()
  let pending = 0
  let raf = 0

  const step = () => {
    const amount = pending * EASE
    pending -= amount
    const camera = viewer.camera
    const height = camera.positionCartographic.height
    const factor = Math.exp(amount * PER_PIXEL)
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height * factor))
    if (next !== height) {
      // Move along the ray under the cursor (or toward the Earth's centre when the cursor is in space)
      const target = camera.pickEllipsoid(cursor, viewer.scene.globe.ellipsoid)
      const toward = target ? Cartesian3.subtract(target, camera.positionWC, new Cartesian3()) : Cartesian3.negate(camera.positionWC, new Cartesian3())
      const distance = target ? Cartesian3.magnitude(toward) : height
      Cartesian3.normalize(toward, toward)
      // Same relative change as the height, so zoom feels even at every altitude
      camera.move(toward, distance * (1 - next / height))
      viewer.scene.requestRender()
    }
    raf = Math.abs(pending) > 0.5 && next !== height ? requestAnimationFrame(step) : 0
    if (!raf) pending = 0
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    cursor.x = e.clientX - rect.left
    cursor.y = e.clientY - rect.top
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * rect.height : e.deltaY
    pending += px
    if (!raf) raf = requestAnimationFrame(step)
  }
  canvas.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    canvas.removeEventListener('wheel', onWheel)
    cancelAnimationFrame(raf)
    if (!viewer.isDestroyed()) viewer.scene.screenSpaceCameraController.zoomEventTypes = before
  }
}
