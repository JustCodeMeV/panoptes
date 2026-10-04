import {
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  NearFarScalar,
  PointPrimitiveCollection,
  VerticalOrigin,
  type Viewer,
} from 'cesium'

// Country and city names, revealed by zoom like a web map: each place carries the web-map zoom
// it first appears at (Natural Earth's ranking, built by scripts/build-places.mjs), turned into
// a camera distance. Cesium hides and fades them per frame, so no work happens on camera moves.

type Places = { countries: [string, number, number, number][]; cities: [string, number, number, number, 0 | 1][] }

// Camera distance at which web-map zoom z shows the same ground detail (60° view, ~900 px tall)
const distanceFor = (zoom: number) => 1.225e8 / 2 ** zoom
// Labels skip the depth test (so the globe never cuts one in half) and are instead hidden
// whole once their spot drops over the horizon
const ALWAYS_ON_TOP = Number.POSITIVE_INFINITY

const cssVar = (name: string, fallback: string) => {
  const root = document.querySelector('.argus')
  return (root && getComputedStyle(root).getPropertyValue(name).trim()) || fallback
}

/** Hair spaces between letters: the tracked caps of a map's country names. */
const tracked = (s: string) => s.toUpperCase().split('').join(' ')
// Glyphs are drawn at twice the size they show at and scaled down, so their edges stay smooth
const LABEL_SCALE = 0.5

/** Adds the place labels; returns a cleanup that frees them. */
export function attachPlaces(viewer: Viewer): () => void {
  let cancelled = false
  const labels = new LabelCollection()
  const dots = new PointPrimitiveCollection()
  viewer.scene.primitives.add(dots)
  viewer.scene.primitives.add(labels)
  // Under everything else, so pins and their count tags always sit on top of place names
  viewer.scene.primitives.lowerToBottom(labels)
  viewer.scene.primitives.lowerToBottom(dots)
  const placed: { normal: Cartesian3; items: { show: boolean }[] }[] = []

  // A place is on the near side when the camera is above its horizon plane
  const toCam = new Cartesian3()
  const cull = () => {
    const cam = viewer.camera.positionWC
    for (const p of placed) {
      Cartesian3.subtract(cam, Cartesian3.multiplyByScalar(p.normal, 6_371_000, toCam), toCam)
      const show = Cartesian3.dot(p.normal, toCam) > 0
      for (const it of p.items) if (it.show !== show) it.show = show
    }
  }
  const offCull = [viewer.camera.changed.addEventListener(cull), viewer.camera.moveEnd.addEventListener(cull)]

  void fetch('/places.json')
    .then((r) => r.json() as Promise<Places>)
    .then(({ countries, cities }) => {
      if (cancelled) return
      const sub = cssVar('--font-sub', 'sans-serif')
      const main = cssVar('--font-main', 'sans-serif')
      const outline = Color.fromCssColorString(cssVar('--color-bg', '#05080c'))
      const ink = Color.fromCssColorString(cssVar('--color-ink', '#eef5fb'))
      const dim = Color.fromCssColorString(cssVar('--color-dim', '#8293a3'))

      const shown = (zoom: number) => {
        const far = distanceFor(zoom)
        return {
          distanceDisplayCondition: new DistanceDisplayCondition(0, far),
          // Fade in over the last stretch, rather than popping
          translucencyByDistance: new NearFarScalar(far * 0.75, 1, far, 0),
        }
      }

      for (const [name, lon, lat, zoom] of countries) {
        const label = labels.add({
          position: Cartesian3.fromDegrees(lon, lat),
          text: tracked(name),
          font: `600 24px ${sub}`,
          scale: LABEL_SCALE,
          fillColor: dim,
          outlineColor: outline,
          outlineWidth: 5,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.CENTER,
          disableDepthTestDistance: ALWAYS_ON_TOP,
          ...shown(zoom),
        })
        placed.push({ normal: Cartesian3.normalize(Cartesian3.fromDegrees(lon, lat), new Cartesian3()), items: [label] })
      }

      for (const [name, lon, lat, zoom, capital] of cities) {
        const position = Cartesian3.fromDegrees(lon, lat)
        const at = shown(zoom)
        const dot = dots.add({
          position,
          pixelSize: capital ? 6 : 5,
          color: capital ? ink : ink.withAlpha(0.8),
          outlineColor: capital ? outline : Color.TRANSPARENT,
          outlineWidth: capital ? 2 : 0,
          distanceDisplayCondition: at.distanceDisplayCondition,
          translucencyByDistance: at.translucencyByDistance,
          disableDepthTestDistance: ALWAYS_ON_TOP,
        })
        const label = labels.add({
          position,
          text: name,
          font: `${capital ? 600 : 500} 26px ${main}`,
          scale: LABEL_SCALE,
          fillColor: capital ? ink : ink.withAlpha(0.85),
          outlineColor: outline,
          outlineWidth: 5,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(7, 0),
          disableDepthTestDistance: ALWAYS_ON_TOP,
          ...at,
        })
        placed.push({ normal: Cartesian3.normalize(position, new Cartesian3()), items: [label, dot] })
      }
      cull()
      // Label glyphs are drawn over the next few frames: keep frames coming until they're in
      const until = performance.now() + 1500
      const frame = () => {
        if (cancelled || viewer.isDestroyed()) return
        viewer.scene.requestRender()
        if (performance.now() < until) requestAnimationFrame(frame)
      }
      frame()
    })

  return () => {
    cancelled = true
    offCull.forEach((off) => off())
    if (viewer.isDestroyed()) return
    viewer.scene.primitives.remove(labels)
    viewer.scene.primitives.remove(dots)
    viewer.scene.requestRender()
  }
}
