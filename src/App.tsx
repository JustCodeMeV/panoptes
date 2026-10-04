import { Suspense, lazy, useEffect, useState } from 'react'
import { BootLoader } from '../gui_elements/Composites'
import { useDesign } from '../gui_elements/context'
import { useLayerData } from './core/useLayerData'
import { DemoBanner } from './ui/DemoBanner'
import { AnalysisPanel } from './ui/AnalysisPanel'
import { Investigation } from './ui/Investigation'
import { LayerPanel } from './ui/LayerPanel'
import { shellGeometry, useShell } from './ui/shell'
import { useGlobeUi } from './globe/globeUi'

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
  const ready = useGlobeUi((s) => s.ready)
  // The loader stays mounted through its fade-out, then goes
  const [loaderGone, setLoaderGone] = useState(false)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setLoaderGone(true), 700)
    return () => clearTimeout(t)
  }, [ready])

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
      {/* The globe (and sky) stay dark until everything has loaded, then fade in as it zooms in */}
      <div
        className={`absolute inset-y-0 transition-[left,width,opacity] duration-(--dur) ease-(--ease) ${ready ? 'opacity-100' : 'opacity-0'}`}
        style={{ left: centre - half, width: half * 2 }}
      >
        <Suspense fallback={null}>
          <GlobeView />
        </Suspense>
      </div>
      {(!ready || !loaderGone) && (
        <div
          className={`pointer-events-none absolute inset-y-0 grid place-items-center transition-opacity duration-500 ${ready ? 'opacity-0' : 'opacity-100'}`}
          style={{ left: freeL, right: freeR }}
          role="status"
          aria-label="Loading the globe"
        >
          <BootLoader />
        </div>
      )}
      <LayerPanel box={geo.left} />
      <AnalysisPanel box={geo.right} />
      <Investigation />
      <DemoBanner />
    </div>
  )
}
