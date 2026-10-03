import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Cartesian3, Color, UrlTemplateImageryProvider, Viewer } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { ViewerContext } from './viewerContext'

/** Owns the Cesium Viewer; children (layer renderers) get it via context. */
export function GlobeHost({ children }: { children?: ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)

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
    v.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19,
        credit: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      }),
    )
    v.scene.globe.baseColor = Color.fromCssColorString('#0b1d3a')
    v.camera.setView({ destination: Cartesian3.fromDegrees(15, 30, 20_000_000) })
    setViewer(v)
    return () => {
      setViewer(null)
      v.destroy()
    }
  }, [])

  return (
    <ViewerContext.Provider value={viewer}>
      <div ref={el} className="globe" />
      {viewer && children}
    </ViewerContext.Provider>
  )
}
