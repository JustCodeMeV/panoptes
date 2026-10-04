import { useEffect, useRef } from 'react'
import {
  type Billboard,
  BoundingSphere,
  CallbackProperty,
  Color,
  Cartesian2,
  Cartesian3,
  ColorMaterialProperty,
  CustomDataSource,
  Entity,
  HeadingPitchRange,
  PolygonHierarchy,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  type Viewer,
} from 'cesium'
import type { Feature } from '../../shared/feature'
import type { LayerDef } from '../core/types'
import { featuresOf, useStore } from '../core/store'
import { FLIGHTS } from '../../gui_elements/flights'
import { useDesign } from '../../gui_elements/context'
import { SPIDER_MAX, useGlobeUi } from './globeUi'
import { pinImage } from './pins'
import { PinLayer, type Pin } from './pinLayer'
import { useViewer } from './viewerContext'

/**
 * Adds a DataSource and returns its remover. Cesium adds asynchronously, so a remove that runs
 * first (React's dev double-mount, a quick unmount) would miss it and leave a stray copy on the
 * globe; this removes it as soon as the add lands instead.
 */
function attachSource(viewer: Viewer, ds: CustomDataSource): () => void {
  let live = true
  void viewer.dataSources.add(ds).then(() => {
    if (!live && !viewer.isDestroyed()) viewer.dataSources.remove(ds, true)
  })
  return () => {
    live = false
    if (!viewer.isDestroyed() && viewer.dataSources.contains(ds)) viewer.dataSources.remove(ds, true)
  }
}

const ring = (r: number[][]) => Cartesian3.fromDegreesArray(r.flatMap(([lon, lat]) => [lon, lat]))

/** Adds a feature's GeoJSON geometry as polygon/polyline entities sharing the feature id. */
function addShape(ds: CustomDataSource, f: Feature, def: LayerDef) {
  const g = f.geometry!
  const st = def.shape?.(f) ?? {}
  const color = Color.fromCssColorString(st.color ?? def.color)
  const fill = color.withAlpha(st.alpha ?? 0.3)
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  // One parent entity carries the id (for picking); parts are children pointing back to it.
  const parent = ds.entities.add(new Entity({ id: f.id }))
  polys.forEach((p, i) =>
    ds.entities.add({
      id: `${f.id}#p${i}`,
      parent,
      polygon: {
        hierarchy: new PolygonHierarchy(ring(p[0]), p.slice(1).map((h) => new PolygonHierarchy(ring(h)))),
        material: fill,
        outline: false,
        height: 0,
      },
      polyline: st.width ? { positions: ring(p[0]), width: st.width, material: color.withAlpha(0.9) } : undefined,
    }),
  )
  lines.forEach((l, i) =>
    ds.entities.add({ id: `${f.id}#l${i}`, parent, polyline: { positions: ring(l), width: st.width ?? 1.5, material: color.withAlpha(st.alpha ?? 0.8) } }),
  )
}

/**
 * Generic: renders ANY layer's features as clustered pins on its own
 * DataSource. Knows nothing about what a layer means; all styling comes from
 * `LayerDef.pin`. Also owns click-picking for the whole globe, unless `interactive` is off
 * (the landing page's fixed view: no picking, no camera flights).
 */
export function LayerRenderer({ layers, interactive = true }: { layers: LayerDef[]; interactive?: boolean }) {
  const viewer = useViewer()!
  const sources = useRef(new Map<string, CustomDataSource>())
  const featureById = useRef(new Map<string, { feature: Feature; def: LayerDef }>())
  // Last applied look per shape: live events re-run sync, but only changed shapes are rebuilt.
  const shapeSig = useRef(new Map<string, string>())
  // Camera flight time follows the design's fly-to feel
  const flight = FLIGHTS[useDesign().flyto]
  const flightSeconds = useRef(flight.dur / 1000)
  useEffect(() => {
    flightSeconds.current = flight.dur / 1000
  }, [flight])

  // Pins and their count tags live in their own engine (see pinLayer.ts): grouped on the globe
  // so they stay still while it turns. Shapes (frontlines, jamming cells, cables) get a
  // DataSource per layer.
  const pins = useRef<PinLayer | null>(null)
  useEffect(() => {
    const layer = new PinLayer(viewer)
    pins.current = layer
    const detach: (() => void)[] = []
    for (const def of layers) {
      const shapes = new CustomDataSource(def.id)
      detach.push(attachSource(viewer, shapes))
      sources.current.set(def.id, shapes)
    }
    const src = sources.current
    return () => {
      detach.forEach((off) => off())
      src.clear()
      layer.destroy()
      pins.current = null
    }
  }, [viewer, layers])

  // Sync entities with store state (diffed by feature id).
  useEffect(() => {
    /** Returns true when anything on the globe changed (so a render is worth requesting). */
    let lastSelected: string | null = null
    const sync = (): boolean => {
      let changed = false
      const { layers: state, selectedId } = useStore.getState()
      const pinLayer = pins.current
      if (!pinLayer) return false
      const list: Pin[] = []
      for (const def of layers) {
        const ds = sources.current.get(def.id)
        if (!ds) continue
        const ls = state[def.id]
        // Each layer's own switch shows or hides its shapes (e.g. deep sea cables)
        const show = ls.enabled
        if (ds.show !== show) {
          ds.show = show
          changed = true
        }
        const features = featuresOf(ls)
        const wantShapes = new Set(features.filter((f) => f.geometry).map((f) => f.id))
        for (const e of [...ds.entities.values])
          if (!wantShapes.has(e.id.split('#')[0])) {
            ds.entities.remove(e)
            shapeSig.current.delete(e.id)
            changed = true
          }
        for (const f of features) {
          featureById.current.set(f.id, { feature: f, def })
          // Shapes (frontlines, jamming cells, cables) are drawn as geometry, never as pins.
          if (f.geometry) {
            // Restyle when the layer's look for it changes (e.g. an index score moving up a band).
            const sig = JSON.stringify(def.shape?.(f) ?? {})
            const had = ds.entities.getById(f.id)
            if (had && shapeSig.current.get(f.id) === sig) continue
            if (had) for (const e of [...ds.entities.values]) if (e.id === f.id || e.id.startsWith(`${f.id}#`)) ds.entities.remove(e)
            addShape(ds, f, def)
            shapeSig.current.set(f.id, sig)
            changed = true
            continue
          }
          if (!f.position || !ls.enabled) continue
          const selected = f.id === selectedId
          const style = def.pin(f)
          const color = style.color ?? def.color
          list.push({
            id: f.id,
            lon: f.position.lon,
            lat: f.position.lat,
            color,
            image: pinImage(color, style.size + (selected ? 10 : 0), f.geoPrecision, selected, style.glyph),
            // The open story always anchors its group, then each layer's own ranking
            rank: (selected ? 1e9 : 0) + (def.rank?.(f) ?? 0),
          })
        }
      }
      // A new selection shows at once; data changes regroup after a short pause
      pinLayer.setPins(list, selectedId !== lastSelected)
      lastSelected = selectedId
      return changed
    }
    // With render-on-demand, one frame isn't enough after a change: pin images load
    // asynchronously, and shown/hidden shapes (e.g. cables) are rebuilt by Cesium over several
    // frames. Keep drawing every frame for a moment so the globe always catches up.
    let settling = 0
    const settle = () => {
      const until = performance.now() + 2000
      cancelAnimationFrame(settling)
      const frame = () => {
        if (viewer.isDestroyed()) return
        viewer.scene.requestRender()
        if (performance.now() < until) settling = requestAnimationFrame(frame)
      }
      frame()
    }
    sync()
    settle()
    // Only re-sync pins when pin-relevant state changed (not on loading flags etc).
    let prev = useStore.getState()
    const unsub = useStore.subscribe((s) => {
      const relevant =
        s.selectedId !== prev.selectedId ||
        layers.some((d) => {
          const a = s.layers[d.id]
          const b = prev.layers[d.id]
          return a.enabled !== b.enabled || a.data !== b.data || a.pinned !== b.pinned
        })
      prev = s
      if (relevant && sync()) settle()
    })
    return () => {
      unsub()
      cancelAnimationFrame(settling)
    }
  }, [layers, viewer])

  // Flash burst where a story just arrived/changed (design: Event flash "Flash burst"): a bright
  // pop that blooms out and fades to the layer colour, so live events are impossible to miss.
  useEffect(() => {
    const ds = new CustomDataSource('ripples')
    const detach = attachSource(viewer, ds)
    const done = new Set<string>()
    const LIFE = 900
    let raf = 0
    const pump = () => {
      viewer.scene.requestRender()
      raf = ds.entities.values.length ? requestAnimationFrame(pump) : 0
    }
    const ripple = (id: string, lon: number, lat: number, color: string, delay: number) => {
      const t0 = performance.now() + delay
      const base = Color.fromCssColorString(color)
      // Evaluated once per frame and shared: Cesium reads major/minor axes separately and
      // requires major >= minor, so two live evaluations would race.
      let p = 0
      let r = 20_000
      const tick = () => {
        p = Math.min(1, Math.max(0, (performance.now() - t0) / LIFE))
        r = 20_000 + viewer.camera.positionCartographic.height * 0.025 * Math.sqrt(p)
      }
      tick()
      viewer.scene.preRender.addEventListener(tick)
      const progress = () => p
      const radius = new CallbackProperty(() => r, false)
      const e = ds.entities.add({
        position: Cartesian3.fromDegrees(lon, lat),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          height: 0,
          material: new ColorMaterialProperty(
            new CallbackProperty(() => (progress() === 0 ? Color.TRANSPARENT : Color.lerp(Color.WHITE, base, Math.min(1, progress() * 2.5), new Color()).withAlpha(0.9 * (1 - progress()) ** 2)), false),
          ),
        },
      })
      setTimeout(() => {
        viewer.scene.preRender.removeEventListener(tick)
        ds.entities.remove(e)
      }, LIFE + delay + 100)
      void id
    }
    const unsub = useStore.subscribe((s) => {
      for (const [id, at] of Object.entries(s.fresh)) {
        if (done.has(`${id}:${at}`)) continue
        done.add(`${id}:${at}`)
        const hit = featureById.current.get(id)
        if (!hit?.feature.position || !s.layers[hit.def.id].enabled) continue
        const color = hit.def.pin(hit.feature).color ?? hit.def.color
        const { lon, lat } = hit.feature.position
        ripple(id, lon, lat, color, 0)
      }
      if (!raf && ds.entities.values.length) raf = requestAnimationFrame(pump)
    })
    return () => {
      unsub()
      cancelAnimationFrame(raf)
      detach()
    }
  }, [viewer])

  // Fly to whatever becomes selected (from globe click OR the list panel).
  useEffect(() => {
    if (!interactive) return
    let last: string | null = null
    return useStore.subscribe((s) => {
      if (s.selectedId === last) return
      last = s.selectedId
      const hit = s.selectedId ? featureById.current.get(s.selectedId) : undefined
      if (!hit || !hit.feature.position) return
      const here = viewer.camera.positionCartographic.height
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          hit.feature.position.lon,
          hit.feature.position.lat - (here > 2e6 ? 0 : 0.4),
          Math.min(here, 1_800_000),
        ),
        duration: flightSeconds.current,
      })
    })
  }, [viewer, interactive])

  // Click picking.
  useEffect(() => {
    if (!interactive) return
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    // Pins pick as their feature id, count tags as the list of ids they hold
    const idsOf = (picked: unknown): string[] | null => {
      const id = (picked as { id?: unknown } | undefined)?.id
      return Array.isArray(id) && id.every((x) => typeof x === 'string') ? (id as string[]).filter((x) => featureById.current.has(x)) : null
    }
    /** Fans a small group out around its tag. False when it's too big to fan. */
    const fan = (picked: { primitive: Billboard }, ids: string[]) => {
      if (ids.length < 2 || ids.length > SPIDER_MAX) return false
      const xy = SceneTransforms.worldToWindowCoordinates(viewer.scene, picked.primitive.position)
      if (!xy) return false
      const key = [...ids].sort().join('|')
      const ui = useGlobeUi.getState()
      if (ui.spider?.key !== key) ui.setSpider({ key, x: xy.x, y: xy.y, ids })
      return true
    }
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position)
      const group = defined(picked) ? idsOf(picked) : null
      // Touch has no hover: a tap fans a small group out
      if (group && fan(picked, group)) return
      // Bigger groups: zoom in, or offer a chooser when they share one spot
      if (group) {
        const pts = group.map((id) => featureById.current.get(id)!.feature.position).filter((p) => !!p).map((p) => Cartesian3.fromDegrees(p!.lon, p!.lat))
        if (pts.length) {
          const sphere = BoundingSphere.fromPoints(pts)
          if (sphere.radius < 500) {
            const rank = (id: string) => {
              const x = featureById.current.get(id)!
              return x.def.rank?.(x.feature) ?? 0
            }
            useStore.getState().openStack([...group].sort((a, b) => rank(b) - rank(a)))
            return
          }
          viewer.camera.flyToBoundingSphere(sphere, {
            duration: 1.0,
            offset: new HeadingPitchRange(0, -Math.PI / 2, Math.max(sphere.radius * 3.2, 350_000)),
          })
        }
        return
      }
      const raw = defined(picked) ? (picked.id instanceof Entity ? (picked.id.id as string) : typeof picked.id === 'string' ? picked.id : null) : null
      const id = raw?.split('#')[0]
      if (id && featureById.current.has(id)) {
        useStore.getState().select(id)
      } else if (!defined(picked)) {
        useStore.getState().select(null)
      }
    }, ScreenSpaceEventType.LEFT_CLICK)
    // scene.pick is a GPU readback: throttle it and never run it while dragging/zooming.
    let lastPick = 0
    let moving = false
    const onStart = () => (moving = true)
    const onEnd = () => (moving = false)
    viewer.camera.moveStart.addEventListener(onStart)
    viewer.camera.moveEnd.addEventListener(onEnd)
    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      const now = performance.now()
      if (moving || now - lastPick < 120) return
      lastPick = now
      const p = viewer.scene.pick(move.endPosition)
      const group = defined(p) ? idsOf(p) : null
      if (group) fan(p, group)
      const pin = defined(p) && typeof p.id === 'string' && featureById.current.has(p.id)
      viewer.scene.canvas.style.cursor = defined(p) && (group || pin || p.id instanceof Entity) ? 'pointer' : 'default'
    }, ScreenSpaceEventType.MOUSE_MOVE)
    return () => {
      viewer.camera.moveStart.removeEventListener(onStart)
      viewer.camera.moveEnd.removeEventListener(onEnd)
      handler.destroy()
    }
  }, [viewer, interactive])

  return null
}
