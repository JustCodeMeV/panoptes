import { ArcType, Cartesian3, Material, PolylineCollection, type Color, type Rectangle, type Scene } from 'cesium'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json'

/**
 * Level-of-detail wireframe globe. Detail rises as the camera comes down:
 *   far   coastlines + country borders (1:110m), 10° graticule
 *   mid   1:50m borders, states/provinces, major rivers and lakes
 *   near  1:10m borders, all states/provinces, rivers, lakes and parks, built only for the
 *         10° cells in view (so GPU memory stays flat however far you roam)
 * Country data is world-atlas; the rest is Natural Earth, built by scripts/build-wireframe.mjs.
 */

export type Kind = 'coast' | 'grid' | 'admin' | 'rivers' | 'lakes' | 'parks'
export type WireStyle = Record<Kind, Color>
type Line = [number, number][]
type Lines = Partial<Record<Kind, Line[]>>
type Countries = Topology<{ countries: GeometryCollection; land: GeometryCollection }>

const FAR = 0
const MID = 1
const NEAR = 2
const tierFor = (height: number) => (height > 5_000_000 ? FAR : height > 1_500_000 ? MID : NEAR)
// Lift off the ellipsoid so lines never flicker against the surface; lower when closer
const LIFT = [3000, 800, 60]
const CELL = 10

function countryLines(topo: Countries): Lines {
  const coast: Line[] = []
  for (const f of feature(topo, topo.objects.land).features)
    if (f.geometry.type === 'Polygon') coast.push(...(f.geometry.coordinates as Line[]))
    else if (f.geometry.type === 'MultiPolygon') for (const p of f.geometry.coordinates as Line[][]) coast.push(...p)
  coast.push(...(mesh(topo, topo.objects.countries, (a, b) => a !== b).coordinates as Line[]))
  return { coast }
}

function graticule(step: number): Line[] {
  const lines: Line[] = []
  for (let lon = -180; lon < 180; lon += step) lines.push(Array.from({ length: 33 }, (_, i) => [lon, -80 + i * 5] as [number, number]))
  for (let lat = -80; lat <= 80; lat += step) lines.push(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat] as [number, number]))
  return lines
}

/** Decodes the delta-encoded detail file (1/1000 degree). */
async function detail(name: '50m' | '10m'): Promise<Lines> {
  const raw = (await (await fetch(`/wire/detail-${name}.json`)).json()) as Record<Kind, number[][]>
  const out: Lines = {}
  for (const [k, list] of Object.entries(raw) as [Kind, number[][]][])
    out[k] = list.map((flat) => {
      const line: Line = []
      let x = 0
      let y = 0
      for (let i = 0; i < flat.length; i += 2) {
        x += flat[i]
        y += flat[i + 1]
        line.push([x / 1000, y / 1000])
      }
      return line
    })
  return out
}

const cellOf = ([lon, lat]: [number, number]) => `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`

export class Wireframe {
  private scene: Scene
  private style: WireStyle
  /** Built collections per tier (near tier: per cell). */
  private far: Map<Kind, PolylineCollection>
  private mid: Map<Kind, PolylineCollection> | null = null
  private nearData: Map<string, Lines> | null = null
  private nearCells = new Map<string, Map<Kind, PolylineCollection>>()
  private loading = new Set<number>()
  private tier = FAR
  private view: Rectangle | undefined
  private destroyed = false

  constructor(scene: Scene, style: WireStyle) {
    this.scene = scene
    this.style = style
    this.far = this.build({ ...countryLines(countries110 as unknown as Countries), grid: graticule(10) }, LIFT[FAR])
  }

  private build(lines: Lines, lift: number): Map<Kind, PolylineCollection> {
    const out = new Map<Kind, PolylineCollection>()
    for (const [kind, list] of Object.entries(lines) as [Kind, Line[]][]) {
      if (!list.length) continue
      const col = new PolylineCollection()
      // Each polyline owns its material (Cesium destroys it with the line), recoloured in place
      for (const l of list)
        col.add({
          positions: Cartesian3.fromDegreesArrayHeights(l.flatMap(([lon, lat]) => [lon, lat, lift])),
          width: 1,
          material: Material.fromType('Color', { color: this.style[kind] }),
          arcType: kind === 'grid' ? ArcType.RHUMB : ArcType.GEODESIC,
        })
      col.show = false
      this.scene.primitives.add(col)
      out.set(kind, col)
    }
    return out
  }

  private all() {
    return [this.far, this.mid, ...this.nearCells.values()].filter((m): m is Map<Kind, PolylineCollection> => !!m)
  }

  /** Recolours every line (colour scheme or satellite view changed). */
  setStyle(style: WireStyle) {
    this.style = style
    for (const m of this.all())
      for (const [kind, col] of m) for (let i = 0; i < col.length; i++) col.get(i).material.uniforms.color = style[kind]
    this.scene.requestRender()
  }

  /** Call when the camera moves: picks the tier for the height and the cells in view. */
  update(height: number, view: Rectangle | undefined) {
    if (this.destroyed) return
    this.view = view
    const want = tierFor(height)
    if (want === MID && !this.mid) return this.load(MID)
    if (want === NEAR && !this.nearData) return this.load(NEAR)
    this.tier = want
    this.show()
  }

  private load(tier: number) {
    if (this.loading.has(tier)) return
    this.loading.add(tier)
    const done = (fn: () => void) => () => {
      if (this.destroyed) return
      fn()
      this.loading.delete(tier)
      const cam = this.scene.camera
      this.update(cam.positionCartographic.height, cam.computeViewRectangle())
    }
    if (tier === MID)
      void Promise.all([import('world-atlas/countries-50m.json'), detail('50m')]).then(([c, d]) =>
        done(() => (this.mid = this.build({ ...countryLines(c.default as unknown as Countries), ...d, grid: graticule(10) }, LIFT[MID])))(),
      )
    else
      void Promise.all([import('world-atlas/countries-10m.json'), detail('10m')]).then(([c, d]) =>
        done(() => {
          // Bucket every line into the 10° cell of its first point
          const cells = new Map<string, Lines>()
          const all: Lines = { ...countryLines(c.default as unknown as Countries), ...d, grid: graticule(5) }
          for (const [kind, list] of Object.entries(all) as [Kind, Line[]][])
            for (const l of list) {
              const key = kind === 'grid' ? 'grid' : cellOf(l[0])
              const cell = cells.get(key) ?? {}
              ;(cell[kind] ??= []).push(l)
              cells.set(key, cell)
            }
          this.nearData = cells
        })(),
      )
  }

  /** Near-tier cells overlapping the view, plus a one-cell margin. */
  private cellsInView(): string[] {
    const v = this.view
    if (!v) return []
    const deg = (r: number) => (r * 180) / Math.PI
    const west = Math.floor(deg(v.west) / CELL) - 1
    let east = Math.floor(deg(v.east) / CELL) + 1
    if (east < west) east += 360 / CELL
    const south = Math.max(-9, Math.floor(deg(v.south) / CELL) - 1)
    const north = Math.min(8, Math.floor(deg(v.north) / CELL) + 1)
    const keys = ['grid']
    for (let x = west; x <= east; x++) for (let y = south; y <= north; y++) keys.push(`${((x + 18 + 36) % 36) - 18},${y}`)
    return keys
  }

  private show() {
    const visible = new Set<Map<Kind, PolylineCollection>>()
    if (this.tier === FAR) visible.add(this.far)
    if (this.tier === MID && this.mid) visible.add(this.mid)
    if (this.tier === NEAR && this.nearData) {
      for (const key of this.cellsInView()) {
        let built = this.nearCells.get(key)
        const lines = this.nearData.get(key)
        if (!built && lines) {
          built = this.build(lines, LIFT[NEAR])
          this.nearCells.set(key, built)
        }
        if (built) visible.add(built)
      }
      // Free cells far out of view
      if (this.nearCells.size > 80)
        for (const [key, m] of this.nearCells)
          if (!visible.has(m)) {
            for (const col of m.values()) this.scene.primitives.remove(col)
            this.nearCells.delete(key)
          }
    }
    for (const m of this.all()) for (const col of m.values()) col.show = visible.has(m)
    this.scene.requestRender()
  }

  destroy() {
    this.destroyed = true
    if (this.scene.isDestroyed()) return
    for (const m of this.all()) for (const col of m.values()) this.scene.primitives.remove(col)
  }
}
