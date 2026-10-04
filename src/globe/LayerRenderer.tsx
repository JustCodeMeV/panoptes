import { useEffect, useRef } from 'react'
import {
  BoundingSphere,
  CallbackProperty,
  Color,
  Cartesian2,
  Cartesian3,
  ColorMaterialProperty,
  CustomDataSource,
  Entity,
  HeadingPitchRange,
  HeightReference,
  NearFarScalar,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  defined,
} from 'cesium'
import type { Feature } from '../../shared/feature'
import type { LayerDef } from '../core/types'
import { featuresOf, useStore } from '../core/store'
import { FLIGHTS } from '../../gui_elements/flights'
import { useDesign } from '../../gui_elements/context'
import { useGlobeUi } from './globeUi'
import { clusterImage, pinImage } from './pins'
import { useViewer } from './viewerContext'

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
  // Last applied look+position per pin: live events re-run sync, but only changed pins are touched.
  const pinSig = useRef(new Map<string, string>())
  // Camera flight time follows the design's fly-to feel
  const flight = FLIGHTS[useDesign().flyto]
  const flightSeconds = useRef(flight.dur / 1000)
  useEffect(() => {
    flightSeconds.current = flight.dur / 1000
  }, [flight])

  // One DataSource per layer, created once.
  useEffect(() => {
    for (const def of layers) {
      const ds = new CustomDataSource(def.id)
      ds.clustering.enabled = true
      ds.clustering.pixelRange = 38
      ds.clustering.minimumClusterSize = 2
      ds.clustering.clusterEvent.addEventListener((members, cluster) => {
        cluster.label.show = false
        cluster.billboard.show = true
        // Cesium leaves this undefined; picking needs it to zoom into the cluster.
        cluster.billboard.id = members
        cluster.billboard.image = clusterImage(def.color, members.length)
        cluster.billboard.verticalOrigin = VerticalOrigin.CENTER
        cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY
        // Images are drawn at 2× for sharpness
        cluster.billboard.scale = 0.5
      })
      void viewer.dataSources.add(ds)
      sources.current.set(def.id, ds)
    }
    const src = sources.current
    return () => {
      for (const ds of src.values()) viewer.dataSources.remove(ds, true)
      src.clear()
    }
  }, [viewer, layers])

  // Sync entities with store state (diffed by feature id).
  useEffect(() => {
    /** Returns true when anything on the globe changed (so a render is worth requesting). */
    const sync = (): boolean => {
      let changed = false
      const { layers: state, selectedId } = useStore.getState()
      const hidden = useGlobeUi.getState().pinsHidden
      featureById.current.clear()
      for (const def of layers) {
        const ds = sources.current.get(def.id)
        if (!ds) continue
        const ls = state[def.id]
        const show = ls.enabled && !hidden
        if (ds.show !== show) {
          ds.show = show
          changed = true
        }
        const features = featuresOf(ls)
        const want = new Map(features.filter((f) => f.position || f.geometry).map((f) => [f.id, f]))
        for (const e of [...ds.entities.values])
          if (!want.has(e.id.split('#')[0])) {
            ds.entities.remove(e)
            pinSig.current.delete(e.id)
            changed = true
          }
        for (const f of features) {
          featureById.current.set(f.id, { feature: f, def })
          // Shapes (frontlines, jamming cells, cables) are drawn as geometry, never as pins.
          if (f.geometry) {
            // Restyle when the layer's look for it changes (e.g. an index score moving up a band).
            const sig = `shape|${JSON.stringify(def.shape?.(f) ?? {})}`
            const had = ds.entities.getById(f.id)
            if (had && pinSig.current.get(f.id) === sig) continue
            if (had) for (const e of [...ds.entities.values]) if (e.id === f.id || e.id.startsWith(`${f.id}#`)) ds.entities.remove(e)
            addShape(ds, f, def)
            pinSig.current.set(f.id, sig)
            changed = true
            continue
          }
          if (!f.position) continue
          const selected = f.id === selectedId
          const style = def.pin(f)
          const size = style.size + (selected ? 10 : 0)
          const sig = `${style.color ?? def.color}|${size}|${f.geoPrecision}|${selected}|${style.glyph}|${f.position.lon}|${f.position.lat}`
          if (pinSig.current.get(f.id) === sig && ds.entities.getById(f.id)) continue
          pinSig.current.set(f.id, sig)
          changed = true
          const position = Cartesian3.fromDegrees(f.position.lon, f.position.lat)
          const billboard = {
            image: pinImage(style.color ?? def.color, size, f.geoPrecision, selected, style.glyph),
            verticalOrigin: VerticalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new NearFarScalar(2e5, 1.2, 2e7, 0.75),
            pixelOffset: new Cartesian2(0, 0),
            // Images are drawn at 2× for sharpness
            scale: 0.6,
          }
          const existing = ds.entities.getById(f.id)
          if (existing) {
            existing.position = position as never
            Object.assign(existing.billboard!, billboard)
          } else {
            ds.entities.add(new Entity({ id: f.id, position, billboard }))
          }
        }
      }
      return changed
    }
    // Pin images load asynchronously; with render-on-demand, ask for a few frames so they show up
    const settle = () => {
      viewer.scene.requestRender()
      for (const ms of [150, 500, 1200]) setTimeout(() => !viewer.isDestroyed() && viewer.scene.requestRender(), ms)
    }
    sync()
    settle()
    // Only re-sync pins when pin-relevant state changed (not on loading flags etc).
    let prev = useStore.getState()
    const unsubUi = useGlobeUi.subscribe(() => {
      if (sync()) settle()
    })
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
      unsubUi()
    }
  }, [layers, viewer])

  // Flash burst where a story just arrived/changed (design: Event flash "Flash burst"): a bright
  // pop that blooms out and fades to the layer colour, so live events are impossible to miss.
  useEffect(() => {
    const ds = new CustomDataSource('ripples')
    void viewer.dataSources.add(ds)
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
      viewer.dataSources.remove(ds, true)
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
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position)
      // Cluster billboards pick as an array of the entities they contain: zoom in.
      if (defined(picked) && Array.isArray(picked.id)) {
        const pts = (picked.id as Entity[])
          .map((e) => e.position?.getValue(viewer.clock.currentTime))
          .filter((p): p is Cartesian3 => !!p)
        if (pts.length) {
          const sphere = BoundingSphere.fromPoints(pts)
          // Co-located features can never be separated by zooming: offer a chooser instead.
          if (sphere.radius < 500) {
            const ids = (picked.id as Entity[])
              .map((e) => e.id as string)
              .filter((id) => featureById.current.has(id))
              .sort((a, b) => {
                const fa = featureById.current.get(a)!
                const fb = featureById.current.get(b)!
                const rank = (x: typeof fa) => x.def.rank?.(x.feature) ?? 0
                return rank(fb) - rank(fa)
              })
            useStore.getState().openStack(ids)
            return
          }
          viewer.camera.flyToBoundingSphere(sphere, {
            duration: 1.0,
            offset: new HeadingPitchRange(0, -Math.PI / 2, Math.max(sphere.radius * 3.2, 350_000)),
          })
        }
        return
      }
      const id = defined(picked) && picked.id instanceof Entity ? (picked.id.id as string).split('#')[0] : null
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
      viewer.scene.canvas.style.cursor = defined(p) && p.id instanceof Entity ? 'pointer' : 'default'
    }, ScreenSpaceEventType.MOUSE_MOVE)
    return () => {
      viewer.camera.moveStart.removeEventListener(onStart)
      viewer.camera.moveEnd.removeEventListener(onEnd)
      handler.destroy()
    }
  }, [viewer, interactive])

  return null
}
