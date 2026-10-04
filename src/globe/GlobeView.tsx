import { LAYERS } from '../layers'
import { GlobeHost } from './GlobeHost'
import { GlobeOverlay } from './GlobeOverlay'
import { LayerRenderer } from './LayerRenderer'
import { PinSpider } from './PinSpider'
import { SelectionFx } from './SelectionFx'
import { WatchCircles } from './WatchCircles'

/** Everything that needs Cesium, in one lazily loaded chunk. */
export default function GlobeView() {
  return (
    <GlobeHost className="app-globe">
      <LayerRenderer layers={LAYERS} />
      <WatchCircles />
      <SelectionFx />
      <PinSpider />
      <GlobeOverlay />
    </GlobeHost>
  )
}
