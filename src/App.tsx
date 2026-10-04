import { Suspense, lazy } from 'react'
import { BootLoader } from '../gui_elements/Composites'
import { useDesign } from '../gui_elements/context'
import { useLayerData } from './core/useLayerData'
import { DemoBanner } from './ui/DemoBanner'
import { DetailDock } from './ui/DetailDock'
import { Investigation } from './ui/Investigation'
import { LayerPanel } from './ui/LayerPanel'
import { shellGeometry, useShell } from './ui/shell'

// Cesium is ~4 MB: load it after the shell so the panels appear immediately.
const GlobeView = lazy(() => import('./globe/GlobeView'))

export default function App() {
  useLayerData()
  const geo = shellGeometry(useDesign())
  const leftMin = useShell((s) => s.leftMin)
  const toolOut = useShell((s) => s.toolOut)

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      {/* Globe area: the space between the panels, growing as panels minimise */}
      <div
        className="absolute inset-y-0 transition-[left,right] duration-(--dur) ease-(--ease)"
        style={{ left: leftMin ? 0 : geo.freeLeft, right: toolOut ? 0 : geo.freeRight }}
      >
        <Suspense fallback={<div className="grid h-full place-items-center"><BootLoader /></div>}>
          <GlobeView />
        </Suspense>
      </div>
      <LayerPanel box={geo.left} />
      <DetailDock box={geo.right} />
      <Investigation />
      <DemoBanner />
    </div>
  )
}
