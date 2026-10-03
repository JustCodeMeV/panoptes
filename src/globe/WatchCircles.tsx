import { Cartesian3, Color, Entity, LabelStyle, VerticalOrigin } from 'cesium'
import { useEffect } from 'react'
import { useStore } from '../core/store'
import { useWatches } from '../layers/watch/state'
import { useViewer } from './viewerContext'

/** Draws each region watch as a translucent circle with its name. */
export function WatchCircles() {
  const viewer = useViewer()
  const list = useWatches((s) => s.list)
  const enabled = useStore((s) => s.layers.watch?.enabled ?? false)
  const load = useWatches((s) => s.load)
  useEffect(() => void load(), [load])
  useEffect(() => {
    if (!viewer || !enabled) return
    const teal = Color.fromCssColorString('#14b8a6')
    const ents = list.map((w) =>
      viewer.entities.add(
        new Entity({
          id: `watch-area:${w.id}`,
          position: Cartesian3.fromDegrees(w.lon, w.lat),
          ellipse: { semiMajorAxis: w.radiusKm * 1000, semiMinorAxis: w.radiusKm * 1000, material: teal.withAlpha(0.14), outline: true, outlineColor: teal.withAlpha(0.9), outlineWidth: 2, height: 0 },
          label: { text: `◎ ${w.name}`, font: '12px sans-serif', fillColor: teal, outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM },
        }),
      ),
    )
    viewer.scene.requestRender()
    return () => {
      for (const e of ents) viewer.entities.remove(e)
      viewer.scene.requestRender()
    }
  }, [viewer, list, enabled])
  return null
}
