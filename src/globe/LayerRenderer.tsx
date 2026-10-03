import { useEffect, useRef } from 'react'
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  CustomDataSource,
  Entity,
  HeadingPitchRange,
  HeightReference,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  defined,
} from 'cesium'
import type { Feature } from '../../shared/feature'
import type { LayerDef } from '../core/types'
import { featuresOf, useStore } from '../core/store'
import { clusterImage, pinImage } from './pins'
import { useViewer } from './viewerContext'

/**
 * Generic: renders ANY layer's features as clustered pins on its own
 * DataSource. Knows nothing about what a layer means; all styling comes from
 * `LayerDef.pin`. Also owns click-picking for the whole globe.
 */
export function LayerRenderer({ layers }: { layers: LayerDef[] }) {
  const viewer = useViewer()!
  const sources = useRef(new Map<string, CustomDataSource>())
  const featureById = useRef(new Map<string, { feature: Feature; def: LayerDef }>())

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
    const sync = () => {
      const { layers: state, selectedId } = useStore.getState()
      featureById.current.clear()
      for (const def of layers) {
        const ds = sources.current.get(def.id)
        if (!ds) continue
        const ls = state[def.id]
        ds.show = ls.enabled
        const features = featuresOf(ls)
        const want = new Map(features.filter((f) => f.position).map((f) => [f.id, f]))
        for (const e of [...ds.entities.values]) if (!want.has(e.id)) ds.entities.remove(e)
        for (const f of features) {
          featureById.current.set(f.id, { feature: f, def })
          if (!f.position) continue
          const selected = f.id === selectedId
          const style = def.pin(f)
          const size = style.size + (selected ? 10 : 0)
          const position = Cartesian3.fromDegrees(f.position.lon, f.position.lat)
          const billboard = {
            image: pinImage(style.color ?? def.color, size, f.geoPrecision, selected, style.glyph),
            verticalOrigin: VerticalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new NearFarScalar(2e5, 1.2, 2e7, 0.75),
            pixelOffset: new Cartesian2(0, 0),
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
    }
    sync()
    // Only re-sync pins when pin-relevant state changed (not on loading flags etc).
    let prev = useStore.getState()
    return useStore.subscribe((s) => {
      const relevant =
        s.selectedId !== prev.selectedId ||
        layers.some((d) => {
          const a = s.layers[d.id]
          const b = prev.layers[d.id]
          return a.enabled !== b.enabled || a.data !== b.data || a.pinned !== b.pinned
        })
      prev = s
      if (relevant) {
        sync()
        viewer.scene.requestRender()
      }
    })
  }, [layers, viewer])

  // Fly to whatever becomes selected (from globe click OR the list panel).
  useEffect(() => {
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
        duration: 1.4,
      })
    })
  }, [viewer])

  // Click picking.
  useEffect(() => {
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
      const id = defined(picked) && picked.id instanceof Entity ? (picked.id.id as string) : null
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
  }, [viewer])

  return null
}
