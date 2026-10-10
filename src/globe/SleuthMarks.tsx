import { Cartesian3, Color, Entity, LabelStyle, PolygonHierarchy, VerticalOrigin } from 'cesium'
import { useEffect } from 'react'
import { useSleuth } from '../core/sleuth'
import { useViewer } from './viewerContext'

/** Point at `km` along `bearing` (degrees from north) from lat/lon, on a sphere. */
function dest(lat: number, lon: number, bearing: number, km: number): [number, number] {
  const R = 6371
  const d = km / R
  const b = (bearing * Math.PI) / 180
  const p1 = (lat * Math.PI) / 180
  const l1 = (lon * Math.PI) / 180
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b))
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return [(p2 * 180) / Math.PI, (((l2 * 180) / Math.PI + 540) % 360) - 180]
}

/** The geolocated camera position: error circle, label, and the heading as a view wedge. */
export function SleuthMarks() {
  const viewer = useViewer()
  const run = useSleuth((s) => s.run)
  const shown = useSleuth((s) => s.shown)
  const f = run?.finding
  useEffect(() => {
    if (!viewer || !shown || f?.lat === undefined || f.lon === undefined) return
    const amber = Color.fromCssColorString('#f59e0b')
    const r = Math.max(f.radius_m ?? 500, 30)
    const ents = [
      viewer.entities.add(
        new Entity({
          id: `sleuth:${run!.id}`,
          position: Cartesian3.fromDegrees(f.lon, f.lat),
          ellipse: { semiMajorAxis: r, semiMinorAxis: r, material: amber.withAlpha(0.15), outline: true, outlineColor: amber, outlineWidth: 2, height: 0 },
          point: { pixelSize: 8, color: amber, outlineColor: Color.BLACK, outlineWidth: 1 },
          label: {
            text: `📷 ${f.place ?? 'photo'} ±${r >= 1000 ? `${(r / 1000).toFixed(1)} km` : `${Math.round(r)} m`}`,
            font: '12px sans-serif', fillColor: amber, outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM,
          },
        }),
      ),
    ]
    if (typeof f.heading_deg === 'number') {
      const km = Math.max((r * 4) / 1000, 0.3)
      const ring = [[f.lat, f.lon], dest(f.lat, f.lon, f.heading_deg - 20, km), dest(f.lat, f.lon, f.heading_deg + 20, km)]
      ents.push(
        viewer.entities.add(
          new Entity({
            id: `sleuth-wedge:${run!.id}`,
            polygon: { hierarchy: new PolygonHierarchy(ring.map(([la, lo]) => Cartesian3.fromDegrees(lo, la))), material: amber.withAlpha(0.3), outline: true, outlineColor: amber, height: 0 },
          }),
        ),
      )
    }
    viewer.scene.requestRender()
    return () => {
      for (const e of ents) viewer.entities.remove(e)
      viewer.scene.requestRender()
    }
  }, [viewer, shown, f, run])
  return null
}
