import { BillboardCollection, Cartesian3, Color, NearFarScalar, PerspectiveFrustum, VerticalOrigin, type Billboard, type Viewer } from 'cesium'
import { clusterImage } from './pins'

/**
 * Pins and their count tags ([3], [12]…), grouped on the globe itself rather than on screen.
 *
 * Grouping uses a ground distance that follows the zoom (about PIXEL_RANGE pixels at the
 * current altitude), so turning the globe never changes it: while the globe rotates, every pin
 * and tag stays fixed to its place, with no flicker. Groups are rebuilt only when the camera
 * has settled at a new altitude, or when the data changes while the camera is still. A rebuild
 * eases in: tags that go shrink and fade, tags that arrive grow in.
 */

export type Pin = {
  id: string
  lon: number
  lat: number
  /** Pin image (data URL) and its layer colour, for the tag a group of pins gets. */
  image: string
  color: string
  /** Higher-ranked pins anchor groups, so a group stays put while minor pins come and go. */
  rank: number
}

type Item = { key: string; ids: string[]; position: Cartesian3; image: string; scale: number; byDistance?: NearFarScalar }
type Shown = { item: Item; bb: Billboard; normal: Cartesian3; from: number; to: number; t0: number; leaving: boolean }

const PIXEL_RANGE = 30
const FADE_MS = 550
// Rebuild after the camera settles only if the altitude changed by more than this
const ZOOM_CHANGE = 0.06
const SETTLE_MS = 300
const DATA_DEBOUNCE_MS = 500
// Pins and tags are drawn at 2× for sharpness
const PIN_SCALE = 0.6
const TAG_SCALE = 0.5
const PIN_DISTANCE = new NearFarScalar(2e5, 1.2, 2e7, 0.75)
const M_PER_DEG = 111_320

const ease = (k: number) => 1 - (1 - k) ** 3

export class PinLayer {
  private viewer: Viewer
  private collection = new BillboardCollection()
  private pins: Pin[] = []
  private shown = new Map<string, Shown>()
  private groupedAt = 0 // camera height of the last grouping
  private moving = false
  private timer = 0
  private raf = 0
  private offs: (() => void)[] = []
  private lastCam = new Cartesian3()

  constructor(viewer: Viewer) {
    this.viewer = viewer
    viewer.scene.primitives.add(this.collection)
    const cam = viewer.camera
    this.offs.push(
      cam.moveStart.addEventListener(() => {
        this.moving = true
        clearTimeout(this.timer)
      }),
      cam.moveEnd.addEventListener(() => {
        this.moving = false
        const h = cam.positionCartographic.height
        if (!this.groupedAt || Math.abs(h - this.groupedAt) / this.groupedAt > ZOOM_CHANGE) this.schedule(SETTLE_MS)
      }),
      // Pins over the horizon are hidden whole (no half-clipped tags at the Earth's edge)
      viewer.scene.preRender.addEventListener(() => this.cull()),
    )
  }

  /** New data (or selection): regroup soon, but never while the camera is moving. */
  setPins(pins: Pin[], immediate = false) {
    this.pins = pins
    this.schedule(immediate ? 0 : DATA_DEBOUNCE_MS)
  }

  private schedule(ms: number) {
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      if (this.moving) return // moveEnd reschedules
      this.regroup()
    }, ms)
  }

  /** Ground metres covered by one screen pixel at the current altitude, looking straight down. */
  private metresPerPixel(): number {
    const f = this.viewer.camera.frustum
    const fovy = f instanceof PerspectiveFrustum ? (f.fovy ?? Math.PI / 3) : Math.PI / 3
    const h = this.viewer.camera.positionCartographic.height
    return (2 * h * Math.tan(fovy / 2)) / Math.max(1, this.viewer.scene.canvas.clientHeight)
  }

  /** Greedy grouping on the ground: each strongest remaining pin takes in its neighbours. */
  private group(): Item[] {
    const range = PIXEL_RANGE * this.metresPerPixel()
    const cell = range / M_PER_DEG // degrees of latitude
    const grid = new Map<string, Pin[]>()
    const cellOf = (p: Pin) => [Math.floor(p.lat / cell), Math.floor((p.lon * Math.cos((p.lat * Math.PI) / 180)) / cell)] as const
    for (const p of this.pins) {
      const [a, b] = cellOf(p)
      const k = `${a},${b}`
      ;(grid.get(k) ?? grid.set(k, []).get(k)!).push(p)
    }
    const taken = new Set<string>()
    const out: Item[] = []
    const byRank = [...this.pins].sort((x, y) => y.rank - x.rank || (x.id < y.id ? -1 : 1))
    for (const anchor of byRank) {
      if (taken.has(anchor.id)) continue
      taken.add(anchor.id)
      const members = [anchor]
      const [a, b] = cellOf(anchor)
      const cos = Math.cos((anchor.lat * Math.PI) / 180)
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const p of grid.get(`${a + i},${b + j}`) ?? []) {
            if (taken.has(p.id)) continue
            const dy = (p.lat - anchor.lat) * M_PER_DEG
            const dx = (p.lon - anchor.lon) * M_PER_DEG * cos
            if (dx * dx + dy * dy <= range * range) {
              taken.add(p.id)
              members.push(p)
            }
          }
      const position = Cartesian3.fromDegrees(anchor.lon, anchor.lat)
      if (members.length === 1) {
        out.push({ key: `p:${anchor.id}`, ids: [anchor.id], position, image: anchor.image, scale: PIN_SCALE, byDistance: PIN_DISTANCE })
      } else {
        // The tag takes the colour most of its pins share
        const votes = new Map<string, number>()
        for (const m of members) votes.set(m.color, (votes.get(m.color) ?? 0) + 1)
        const color = [...votes].sort((x, y) => y[1] - x[1])[0][0]
        out.push({ key: `c:${anchor.id}`, ids: members.map((m) => m.id), position, image: clusterImage(color, members.length), scale: TAG_SCALE })
      }
    }
    return out
  }

  private regroup() {
    if (this.viewer.isDestroyed()) return
    this.groupedAt = this.viewer.camera.positionCartographic.height
    const next = this.group()
    const now = performance.now()
    const keep = new Set<string>()
    for (const item of next) {
      // Same group with the same look: leave it exactly as it is
      const id = `${item.key}|${item.image}`
      keep.add(id)
      const had = this.shown.get(id)
      if (had && !had.leaving) {
        had.item = item
        had.bb.id = item.ids.length === 1 ? item.ids[0] : item.ids
        continue
      }
      const bb = this.collection.add({
        position: item.position,
        image: item.image,
        scale: item.scale * 0.4,
        color: new Color(1, 1, 1, 0),
        verticalOrigin: VerticalOrigin.CENTER,
        scaleByDistance: item.byDistance,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        // Picking: one feature id for a pin, the list of ids for a tag
        id: item.ids.length === 1 ? item.ids[0] : item.ids,
      })
      this.shown.set(id, { item, bb, normal: Cartesian3.normalize(item.position, new Cartesian3()), from: 0, to: 1, t0: now, leaving: false })
    }
    for (const [id, s] of this.shown)
      if (!keep.has(id) && !s.leaving) {
        s.leaving = true
        s.from = this.progress(s, now)
        s.to = 0
        s.t0 = now
        // A leaving pin can't be picked any more
        s.bb.id = undefined
      }
    Cartesian3.clone(Cartesian3.ZERO, this.lastCam)
    this.cull()
    this.animate()
  }

  private progress(s: Shown, now: number) {
    const k = Math.min(1, (now - s.t0) / FADE_MS)
    return s.from + (s.to - s.from) * ease(k)
  }

  /** Eases tags in (grow + fade) and out (shrink + fade), drawing frames only while it lasts. */
  private animate() {
    cancelAnimationFrame(this.raf)
    const frame = () => {
      if (this.viewer.isDestroyed()) return
      const now = performance.now()
      let busy = false
      for (const [id, s] of this.shown) {
        const v = this.progress(s, now)
        s.bb.color = new Color(1, 1, 1, v)
        s.bb.scale = s.item.scale * (0.4 + 0.6 * v)
        if (now - s.t0 < FADE_MS) busy = true
        else if (s.leaving) {
          this.collection.remove(s.bb)
          this.shown.delete(id)
        }
      }
      this.viewer.scene.requestRender()
      if (busy) this.raf = requestAnimationFrame(frame)
    }
    frame()
  }

  /** Shows only what's on the near side of the Earth; runs before a frame whenever the camera moved. */
  private cull() {
    const cam = this.viewer.camera.positionWC
    if (Cartesian3.equalsEpsilon(cam, this.lastCam, 0, 1)) return
    Cartesian3.clone(cam, this.lastCam)
    const toCam = new Cartesian3()
    for (const s of this.shown.values()) {
      // On the near side when the camera is above the pin's horizon plane
      Cartesian3.subtract(cam, s.item.position, toCam)
      const show = Cartesian3.dot(s.normal, toCam) > 0
      if (s.bb.show !== show) s.bb.show = show
    }
  }

  destroy() {
    clearTimeout(this.timer)
    cancelAnimationFrame(this.raf)
    this.offs.forEach((off) => off())
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.collection)
  }
}
