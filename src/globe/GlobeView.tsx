import { LAYERS } from '../layers'
import { GlobeHost } from './GlobeHost'
import { LayerRenderer } from './LayerRenderer'
import { WatchCircles } from './WatchCircles'

/** Everything that needs Cesium, in one lazily loaded chunk. */
export default function GlobeView() {
  return (
    <GlobeHost>
      <LayerRenderer layers={LAYERS} />
      <WatchCircles />
    </GlobeHost>
  )
}
