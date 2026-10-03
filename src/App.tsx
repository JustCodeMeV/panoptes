import { Suspense, lazy } from 'react'
import { useLayerData } from './core/useLayerData'
import { LayerPanel } from './ui/LayerPanel'
import { DetailDock } from './ui/DetailDock'
import { LiveFeed } from './ui/LiveFeed'

// Cesium is ~4 MB: load it after the shell so the panels appear immediately.
const GlobeView = lazy(() => import('./globe/GlobeView'))

export default function App() {
  useLayerData()
  return (
    <>
      <Suspense fallback={<div className="globe boot">Loading globe…</div>}>
        <GlobeView />
      </Suspense>
      <LayerPanel />
      <LiveFeed />
      <DetailDock />
    </>
  )
}
