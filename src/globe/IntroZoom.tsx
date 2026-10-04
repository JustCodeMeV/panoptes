import { useEffect, useState } from 'react'
import { Cartesian3, EasingFunction, Math as CMath } from 'cesium'
import { useStore } from '../core/store'
import { LAYERS } from '../layers'
import { HOME, useGlobeUi } from './globeUi'
import { useViewer } from './viewerContext'

// Where the camera waits while things load, and how long the arrival takes
const FAR = 90_000_000
const ARRIVE_S = 2.6
// Never keep someone waiting on a slow source
const GIVE_UP_MS = 15_000

/**
 * Opening sequence for the app: the globe stays dark (the page shows the loader) while the
 * first imagery tiles and every enabled layer's first data arrive, then it's marked ready and
 * the camera flies in from deep space to the home view.
 */
export function IntroZoom() {
  const viewer = useViewer()!
  const setReady = useGlobeUi((s) => s.setReady)
  const dataReady = useStore((s) => LAYERS.every((l) => !s.layers[l.id].enabled || !!s.layers[l.id].data || !!s.layers[l.id].error))
  const [tiles, setTiles] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  // Park the camera far away, and keep frames coming so tiles load behind the loader
  useEffect(() => {
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(HOME.lon, HOME.lat, FAR) })
    const globe = viewer.scene.globe
    const off = globe.tileLoadProgressEvent.addEventListener((queued: number) => {
      if (queued === 0 && globe.tilesLoaded) setTiles(true)
    })
    const pump = setInterval(() => viewer.scene.requestRender(), 200)
    const give = setTimeout(() => setTimedOut(true), GIVE_UP_MS)
    return () => {
      off()
      clearInterval(pump)
      clearTimeout(give)
      setReady(false)
    }
  }, [viewer, setReady])

  const go = (tiles && dataReady) || timedOut
  useEffect(() => {
    if (!go) return
    setReady(true)
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height),
      orientation: { heading: 0, pitch: CMath.toRadians(-90), roll: 0 },
      duration: ARRIVE_S,
      easingFunction: EasingFunction.CUBIC_OUT,
    })
  }, [go, viewer, setReady])

  return null
}
