import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArcType,
  Cartesian3,
  Color,
  ImageryLayer,
  Material,
  PolylineCollection,
  UrlTemplateImageryProvider,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json'
import { COLOURS } from '../../gui_elements/catalog'
import { useAtlasControls } from '../../gui_elements/context'
import { useGlobeUi } from './globeUi'
import { attachSky } from './sky'
import { ViewerContext } from './viewerContext'

/** Coastlines + country borders and a 10° graticule, as line strings in degrees. */
function wireframeLines(): [number, number][][] {
  const topo = countries110 as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>
  const coast = feature(topo, topo.objects.land)
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b)
  const rings: [number, number][][] = []
  for (const f of coast.features)
    if (f.geometry.type === 'Polygon') rings.push(...(f.geometry.coordinates as [number, number][][]))
    else if (f.geometry.type === 'MultiPolygon') for (const p of f.geometry.coordinates as [number, number][][][]) rings.push(...p)
  rings.push(...(borders.coordinates as [number, number][][]))
  return rings
}

function graticule(): [number, number][][] {
  const lines: [number, number][][] = []
  for (let lon = -180; lon < 180; lon += 10) lines.push(Array.from({ length: 33 }, (_, i) => [lon, -80 + i * 5] as [number, number]))
  for (let lat = -80; lat <= 80; lat += 10) lines.push(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat] as [number, number]))
  return lines
}

// Lifted slightly off the ellipsoid so the lines never flicker against the globe surface
const toPositions = (line: [number, number][]) => Cartesian3.fromDegreesArrayHeights(line.flatMap(([lon, lat]) => [lon, lat, 3000]))

/**
 * Owns the Cesium Viewer; children (layer renderers, overlays) get it via context.
 * Styled to the ATLAS design: a dark wireframe globe (coastlines, borders, graticule) in the
 * scheme's accent, with satellite imagery and the night sky switchable from the globe controls.
 * `satellite` / `sky` force a view (the landing page) instead of following the controls.
 */
export function GlobeHost({ children, satellite: forceSatellite, sky: forceSky }: { children?: ReactNode; satellite?: boolean; sky?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
  // The same viewer, for imperative styling (Cesium objects are mutated, not React state)
  const viewerRef = useRef<Viewer | null>(null)
  const imagery = useRef<ImageryLayer | null>(null)
  const lines = useRef<{ wire: PolylineCollection; grid: PolylineCollection } | null>(null)
  const controls = useAtlasControls()
  const { colour } = controls
  const satellite = forceSatellite ?? controls.satellite
  const skyToggle = useGlobeUi((s) => s.sky)
  const sky = forceSky ?? skyToggle

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
    // Wireframe: coastlines/borders and graticule as ground-hugging polylines
    const wire = new PolylineCollection()
    const grid = new PolylineCollection()
    for (const l of wireframeLines()) wire.add({ positions: toPositions(l), width: 1, arcType: ArcType.GEODESIC })
    for (const l of graticule()) grid.add({ positions: toPositions(l), width: 1, arcType: ArcType.RHUMB })
    v.scene.primitives.add(grid)
    v.scene.primitives.add(wire)
    lines.current = { wire, grid }

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
      lines.current = null
      imagery.current = null
      // React unmounts parents before children: let the layer renderers and overlays
      // release their Cesium objects first, then tear the viewer down.
      v.useDefaultRenderLoop = false
      setTimeout(() => v.destroy())
    }
  }, [])

  // Colour scheme and satellite / wireframe view
  useEffect(() => {
    const v = viewerRef.current
    if (!v || !viewer || !lines.current) return
    const c = COLOURS[colour]
    const accent = Color.fromCssColorString(c.accent2)
    const scene = v.scene
    imagery.current!.show = satellite
    scene.globe.baseColor = Color.fromCssColorString(c.bg)
    scene.backgroundColor = Color.fromCssColorString(c.bg)
    scene.globe.showGroundAtmosphere = satellite
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = satellite
    const paint = (col: PolylineCollection, color: Color) => {
      const material = Material.fromType('Color', { color })
      for (let i = 0; i < col.length; i++) col.get(i).material = material
    }
    paint(lines.current.wire, satellite ? Color.WHITE.withAlpha(0.28) : accent.withAlpha(0.75))
    paint(lines.current.grid, accent.withAlpha(satellite ? 0.06 : 0.14))
    scene.requestRender()
  }, [viewer, colour, satellite])

  // Night sky: built when switched on, freed when switched off
  useEffect(() => {
    if (!viewer || !sky) return
    return attachSky(viewer)
  }, [viewer, sky])

  return (
    <ViewerContext.Provider value={viewer}>
      <div ref={el} className="globe" />
      {viewer && children}
    </ViewerContext.Provider>
  )
}
