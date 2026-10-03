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
import { useStore } from '../core/store'
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
      ds.clustering.minimumClusterSize = 3
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
        const features = ls.data?.features ?? []
        const want = new Map(features.map((f) => [f.id, f]))
        for (const e of [...ds.entities.values]) if (!want.has(e.id)) ds.entities.remove(e)
        for (const f of features) {
          featureById.current.set(f.id, { feature: f, def })
          const selected = f.id === selectedId
          const size = def.pin(f).size + (selected ? 10 : 0)
          const position = Cartesian3.fromDegrees(f.position.lon, f.position.lat)
          const billboard = {
            image: pinImage(def.color, size, f.geoPrecision, selected),
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
    return useStore.subscribe(sync)
  }, [layers, viewer])

  // Fly to whatever becomes selected (from globe click OR the list panel).
  useEffect(() => {
    let last: string | null = null
    return useStore.subscribe((s) => {
      if (s.selectedId === last) return
      last = s.selectedId
      const hit = s.selectedId ? featureById.current.get(s.selectedId) : undefined
      if (!hit) return
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
    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      const p = viewer.scene.pick(move.endPosition)
      viewer.scene.canvas.style.cursor = defined(p) && p.id instanceof Entity ? 'pointer' : 'default'
    }, ScreenSpaceEventType.MOUSE_MOVE)
    return () => handler.destroy()
  }, [viewer])

  return null
}
