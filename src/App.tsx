import { Suspense, lazy, useEffect, useState } from 'react'
import { BootLoader } from '../gui_elements/Composites'
import { useDesign } from '../gui_elements/context'
import { useLayerData } from './core/useLayerData'
import { DemoBanner } from './ui/DemoBanner'
import { AnalysisPanel } from './ui/AnalysisPanel'
import { LayerPanel } from './ui/LayerPanel'
import { shellGeometry, useShell } from './ui/shell'

// Cesium is ~4 MB: load it after the shell so the panels appear immediately.
const GlobeView = lazy(() => import('./globe/GlobeView'))

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

export default function App() {
  useLayerData()
  const geo = shellGeometry(useDesign())
  const leftMin = useShell((s) => s.leftMin)
  const toolOut = useShell((s) => s.toolOut)
  const width = useWindowWidth()

  // Free area: the space between the panels, growing as panels minimise.
  const freeL = leftMin ? 0 : geo.freeLeft
  const freeR = toolOut ? 0 : geo.freeRight
  // The globe canvas always fills the screen behind the panels, but is centred on the free
  // area: it extends past the screen edge on the far side (clipped), so the globe sits in
  // the middle of what you can see and glides across as panels open and close.
  const centre = (freeL + width - freeR) / 2
  const half = Math.max(centre, width - centre)

  return (
    // overflow-clip, not hidden: the globe canvas runs past the screen edge, and a hidden-overflow
    // box can still be scrolled sideways (focus, scrollIntoView), shoving the panels off screen
    <div className="relative h-full w-full overflow-clip bg-bg">
      <div
        className="absolute inset-y-0 transition-[left,width] duration-(--dur) ease-(--ease)"
        style={{ left: centre - half, width: half * 2 }}
      >
        <Suspense fallback={<div className="grid h-full place-items-center"><BootLoader /></div>}>
          <GlobeView />
        </Suspense>
      </div>
      <LayerPanel box={geo.left} />
      <AnalysisPanel box={geo.right} />
      <DemoBanner />
    </div>
  )
}
