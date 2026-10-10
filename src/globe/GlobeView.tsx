import { LAYERS } from '../layers'
import { GlobeHost } from './GlobeHost'
import { GlobeOverlay } from './GlobeOverlay'
import { LayerRenderer } from './LayerRenderer'
import { IntroZoom } from './IntroZoom'
import { PinSpider } from './PinSpider'
import { SelectionFx } from './SelectionFx'
import { WatchCircles } from './WatchCircles'
import { SleuthMarks } from './SleuthMarks'
import { Showreel } from './Showreel'

/** Everything that needs Cesium, in one lazily loaded chunk. */
export default function GlobeView() {
  return (
    <GlobeHost className="app-globe">
      <LayerRenderer layers={LAYERS} />
      <WatchCircles />
      <SleuthMarks />
      <IntroZoom />
      <SelectionFx />
      <PinSpider />
      <GlobeOverlay />
      <Showreel />
    </GlobeHost>
  )
}
