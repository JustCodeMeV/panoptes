import { Body, GeoVector } from 'astronomy-engine'
import { Cartesian3, Color, JulianDate, Matrix3, PointPrimitiveCollection, SkyBox, Transforms, type Viewer } from 'cesium'

// NASA SVS Deep Star Maps 2020 (public domain), cut to 1024 px cube faces and dimmed
// so the sky stays a backdrop. Faces live in public/sky/.
const FACES = {
  positiveX: '/sky/px.jpg',
  negativeX: '/sky/mx.jpg',
  positiveY: '/sky/py.jpg',
  negativeY: '/sky/my.jpg',
  positiveZ: '/sky/pz.jpg',
  negativeZ: '/sky/mz.jpg',
}

// Naked-eye look: brightness by size, true-ish tint, no labels
const PLANETS = [
  { body: Body.Mercury, color: '#e6d8c4', size: 2.5 },
  { body: Body.Venus, color: '#fff7e6', size: 4.5 },
  { body: Body.Mars, color: '#ff9e72', size: 3.5 },
  { body: Body.Jupiter, color: '#fff0d2', size: 4 },
  { body: Body.Saturn, color: '#f3dca6', size: 3.5 },
  { body: Body.Uranus, color: '#c4eef4', size: 2 },
  { body: Body.Neptune, color: '#9dbcff', size: 2 },
]

// Planets are drawn on a shell just beyond the Moon and inside the camera's far plane.
// Being behind the globe, they're hidden by it like the stars.
const SHELL = 4.5e8

/**
 * Shows the real sky behind the globe: stars and Milky Way, the Sun and Moon (Cesium places
 * both for the current time) and the naked-eye planets (astronomy-engine). Returns a cleanup
 * that frees everything, so a switched-off sky costs nothing.
 */
export function attachSky(viewer: Viewer): () => void {
  const scene = viewer.scene
  const previous = scene.skyBox
  const sky = new SkyBox({ sources: FACES })
  scene.skyBox = sky
  if (scene.sun) scene.sun.show = true
  if (scene.moon) scene.moon.show = true

  const points = scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection
  const marks = PLANETS.map((p) => {
    const color = Color.fromCssColorString(p.color)
    return points.add({ color, pixelSize: p.size, outlineColor: color.withAlpha(0.18), outlineWidth: p.size * 0.8 })
  })

  const toFixed = new Matrix3()
  const update = () => {
    const now = new Date()
    // The star map turns with sidereal time: keep the scene clock on the wall clock
    viewer.clock.currentTime = JulianDate.fromDate(now)
    // Same frame the sky box uses, so planets sit exactly on the star map
    Transforms.computeTemeToPseudoFixedMatrix(viewer.clock.currentTime, toFixed)
    PLANETS.forEach((p, i) => {
      const g = GeoVector(p.body, now, true)
      const dir = Cartesian3.normalize(new Cartesian3(g.x, g.y, g.z), new Cartesian3())
      marks[i].position = Cartesian3.multiplyByScalar(Matrix3.multiplyByVector(toFixed, dir, dir), SHELL, dir)
    })
    scene.requestRender()
  }
  update()
  const tick = setInterval(update, 60_000)
  // Faces load asynchronously and render-on-demand won't redraw by itself when they land
  let frames = 0
  const settle = setInterval(() => {
    scene.requestRender()
    if (++frames > 20) clearInterval(settle)
  }, 200)

  return () => {
    clearInterval(tick)
    clearInterval(settle)
    if (viewer.isDestroyed()) return
    scene.primitives.remove(points)
    scene.skyBox = previous
    sky.destroy()
    if (scene.sun) scene.sun.show = false
    if (scene.moon) scene.moon.show = false
    scene.requestRender()
  }
}
