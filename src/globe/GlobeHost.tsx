import { useShell } from '../ui/shell'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Cartesian3, Color, EllipsoidTerrainProvider, ImageryLayer, Ion, JulianDate, Terrain, UrlTemplateImageryProvider, Viewer } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { COLOURS } from '../../gui_elements/catalog'
import { useArgusControls } from '../../gui_elements/context'
import { useGlobeUi } from './globeUi'
import { attachSky } from './sky'
import { ViewerContext } from './viewerContext'
import { Wireframe, type WireStyle } from './wireframe'

// Cesium World Terrain needs an ion token: VITE_CESIUM_ION_TOKEN if set, otherwise Cesium's built-in evaluation token.
const ION = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined
if (ION) Ion.defaultAccessToken = ION

/** 3D relief (Cesium World Terrain) in satellite view; the smooth ellipsoid under the wireframe. */
function applyTerrain(v: Viewer, on: boolean) {
  if (on) v.scene.setTerrain(Terrain.fromWorldTerrain({ requestVertexNormals: true }))
  else v.terrainProvider = new EllipsoidTerrainProvider()
  v.scene.requestRender()
}

const WATER = Color.fromCssColorString('#4fa8ff')
const PARK = Color.fromCssColorString('#5fd38d')

/** Line colours for the wireframe, in the scheme's accent (muted under satellite imagery). */
function wireStyle(accent: Color, satellite: boolean): WireStyle {
  return satellite
    ? { coast: Color.WHITE.withAlpha(0.28), grid: accent.withAlpha(0.06), admin: Color.WHITE.withAlpha(0.16), rivers: WATER.withAlpha(0.35), lakes: WATER.withAlpha(0.3), parks: PARK.withAlpha(0.3) }
    : { coast: accent.withAlpha(0.75), grid: accent.withAlpha(0.14), admin: accent.withAlpha(0.35), rivers: WATER.withAlpha(0.6), lakes: WATER.withAlpha(0.5), parks: PARK.withAlpha(0.5) }
}

/**
 * Owns the Cesium Viewer; children (layer renderers, overlays) get it via context.
 * Styled to the ARGUS design: a dark wireframe globe (coastlines, borders, graticule) in the
 * scheme's accent, with satellite imagery and the night sky switchable from the globe controls.
 * `satellite` / `sky` force a view (the landing page) instead of following the controls.
 */
export function GlobeHost({
  children,
  className = '',
  satellite: forceSatellite,
  sky: forceSky,
  darkSide: forceDarkSide,
  wireframe = true,
}: {
  children?: ReactNode
  className?: string
  satellite?: boolean
  sky?: boolean
  darkSide?: boolean
  /** Borders, coastlines and grid lines (off for the landing page's photographic view). */
  wireframe?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
  // The same viewer, for imperative styling (Cesium objects are mutated, not React state)
  const viewerRef = useRef<Viewer | null>(null)
  const imagery = useRef<ImageryLayer | null>(null)
  const wire = useRef<Wireframe | null>(null)
  // Fixed for the viewer's lifetime (read once when it is created)
  const withWireframe = useRef(wireframe)
  const controls = useArgusControls()
  const { colour } = controls
  const satellite = forceSatellite ?? controls.satellite
  const skyToggle = useGlobeUi((s) => s.sky)
  const sky = forceSky ?? skyToggle
  const darkToggle = useGlobeUi((s) => s.darkSide)
  const darkSide = forceDarkSide ?? darkToggle
  const night = useRef<ImageryLayer | null>(null)

  useEffect(() => {
    if (!el.current) return
    const v = new Viewer(el.current, {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      homeButton: false,
      sceneModePicker: false,
    })
    // Esri World Imagery: free satellite tiles, no token. Attribution is shown by Cesium.
    imagery.current = v.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19,
        credit: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      }),
    )
    // NASA Black Marble (VIIRS city lights, GIBS: free, no key), shown only on the night side
    night.current = v.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
        maximumLevel: 8,
        credit: 'NASA Earth Observatory / GIBS Black Marble',
      }),
    )
    night.current.dayAlpha = 0
    night.current.show = false
    // Lighting and night imagery normally fade out from far away: keep them at every altitude
    v.scene.globe.lightingFadeOutDistance = 9e9
    v.scene.globe.lightingFadeInDistance = 1e10
    v.scene.globe.nightFadeOutDistance = 9e9
    v.scene.globe.nightFadeInDistance = 1e10

    // Wireframe: detail rises as the camera comes down
    const wf = withWireframe.current ? new Wireframe(v.scene, wireStyle(Color.WHITE, false)) : null
    wire.current = wf
    const lod = () => wf?.update(v.camera.positionCartographic.height, v.camera.computeViewRectangle())
    const offLod = wf ? [v.camera.changed.addEventListener(lod), v.camera.moveEnd.addEventListener(lod)] : []
    lod()

    // Clean HUD look: no stars, sun or moon until the sky is switched on
    if (v.scene.skyBox) v.scene.skyBox.show = false
    if (v.scene.sun) v.scene.sun.show = false
    if (v.scene.moon) v.scene.moon.show = false
    // Render only when something changes (camera, data) instead of 60 fps forever.
    v.scene.requestRenderMode = true
    v.scene.maximumRenderTimeChange = Infinity
    // Cheaper frames: pins are textured billboards so MSAA buys little, and coarser
    // terrain/imagery LOD means far fewer tile loads while zooming.
    v.scene.msaaSamples = 1
    v.scene.globe.maximumScreenSpaceError = 4
    v.scene.globe.tileCacheSize = 200
    v.camera.setView({ destination: Cartesian3.fromDegrees(15, 30, 20_000_000) })
    // Fire camera.changed often enough for the live position readout
    v.camera.percentageChanged = 0.01

    // The globe area resizes as panels minimise: keep the canvas in step
    const ro = new ResizeObserver(() => {
      v.resize()
      v.scene.requestRender()
    })
    ro.observe(el.current)
    viewerRef.current = v
    setViewer(v)
    return () => {
      ro.disconnect()
      viewerRef.current = null
      setViewer(null)
      offLod.forEach((off) => off())
      wf?.destroy()
      wire.current = null
      imagery.current = null
      night.current = null
      // React unmounts parents before children: let the layer renderers and overlays
      // release their Cesium objects first, then tear the viewer down.
      v.useDefaultRenderLoop = false
      setTimeout(() => v.destroy())
    }
  }, [])

  // Case mode hides the globe: stop rendering it until the analyst comes back
  const caseMode = useShell((s) => s.caseMode)
  useEffect(() => {
    const v = viewerRef.current
    if (v && !v.isDestroyed()) v.useDefaultRenderLoop = !caseMode
  }, [viewer, caseMode])

  // Terrain follows the satellite view in the app (the landing page keeps the light ellipsoid).
  useEffect(() => {
    if (!viewer || forceSatellite !== undefined) return
    applyTerrain(viewer, satellite)
  }, [viewer, satellite, forceSatellite])

  // Colour scheme and satellite / wireframe view
  useEffect(() => {
    const v = viewerRef.current
    if (!v || !viewer) return
    const c = COLOURS[colour]
    const accent = Color.fromCssColorString(c.accent2)
    const scene = v.scene
    imagery.current!.show = satellite
    // Imagery at full detail in satellite view (twice as sharp, incl. city lights); the wireframe
    // globe has no imagery, so it keeps the cheaper level of detail
    scene.globe.maximumScreenSpaceError = satellite ? 2 : 4
    scene.globe.tileCacheSize = satellite ? 400 : 200
    scene.globe.baseColor = Color.fromCssColorString(c.bg)
    scene.backgroundColor = Color.fromCssColorString(c.bg)
    scene.globe.showGroundAtmosphere = satellite
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = satellite
    wire.current?.setStyle(wireStyle(accent, satellite))
    scene.requestRender()
  }, [viewer, colour, satellite])

  // Dark side: the real day/night terminator for this moment (sun position follows the date,
  // so seasons and the Earth's tilt come for free), city lights on the night side.
  useEffect(() => {
    const v = viewerRef.current
    if (!v || !viewer || !imagery.current || !night.current) return
    const on = satellite && darkSide
    const scene = v.scene
    scene.globe.enableLighting = on
    scene.globe.dynamicAtmosphereLighting = on
    night.current.show = on
    // Day imagery disappears where it's night; Black Marble shows there instead
    imagery.current.nightAlpha = on ? 0 : 1
    // Real time, redrawn once a minute so the terminator creeps across like the real one
    v.clock.currentTime = JulianDate.now()
    v.clock.multiplier = 1
    v.clock.shouldAnimate = on
    scene.maximumRenderTimeChange = on ? 60 : Infinity
    scene.requestRender()
  }, [viewer, satellite, darkSide])

  // Night sky: built when switched on, freed when switched off
  useEffect(() => {
    if (!viewer || !sky) return
    return attachSky(viewer)
  }, [viewer, sky])

  return (
    <ViewerContext.Provider value={viewer}>
      <div ref={el} className={`globe ${className}`} />
      {viewer && children}
    </ViewerContext.Provider>
  )
}
