import { useLayerData } from './core/useLayerData'
import { LAYERS } from './layers'
import { GlobeHost } from './globe/GlobeHost'
import { LayerRenderer } from './globe/LayerRenderer'
import { LayerPanel } from './ui/LayerPanel'
import { DetailDock } from './ui/DetailDock'
import { LiveFeed } from './ui/LiveFeed'

export default function App() {
  useLayerData()
  return (
    <>
      <GlobeHost>
        <LayerRenderer layers={LAYERS} />
      </GlobeHost>
      <LayerPanel />
      <LiveFeed />
      <DetailDock />
    </>
  )
}
