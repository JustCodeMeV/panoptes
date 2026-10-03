// Sample data for the design editor.
import type { FeedEntry, Layer, MetaItem } from '../../gui_elements/Composites'
import type { GlobeCluster, GlobePin } from './MockGlobe'

export const DEMO_LAYERS: Layer[] = [
  { id: 'streams', label: 'Live streams', count: 128, on: true, desc: 'Public livestreams placed by uploader location or inferred from the title.', status: 'updated 12s ago · 3 sources', color: 1, spark: [3, 5, 4, 7, 6, 9, 8, 11] },
  { id: 'protests', label: 'Protests', count: 37, on: true, desc: 'Gatherings reported by news wires and local press.', status: 'updated 1m ago · 2 sources', color: 2, spark: [2, 2, 3, 5, 4, 4, 6, 7] },
  { id: 'influence', label: 'Influence ops', count: 0, on: false, desc: 'Coordinated inauthentic activity, scored by source.', status: 'off', color: 4, spark: [1, 1, 2, 1, 2, 2, 1, 2] },
]
export const DEMO_FEED: FeedEntry[] = [
  { id: 'a', title: 'Protesters gather outside parliament as police form lines', sub: 'Tbilisi', p: 'exact', time: '14:32', viewers: '1.2k' },
  { id: 'b', title: 'Night march reaches central square', sub: 'Belgrade', p: 'approximate', time: '14:28', viewers: '860' },
  { id: 'c', title: 'Port workers walk out over wage freeze', sub: 'Lagos', p: 'inferred', time: '14:11', viewers: '412' },
]
export const DEMO_META: MetaItem[] = [
  { k: 'Source', v: 'youtube-api' },
  { k: 'Precision', v: 'approximate' },
  { k: 'Geo basis', v: 'uploader location, 1 km' },
  { k: 'Started', v: '13:58 UTC' },
  { k: 'Viewers', v: '1,204' },
]

export const DEMO_PINS: GlobePin[] = [
  { id: 'tbilisi', name: 'Tbilisi', lon: 44.8, lat: 41.7, p: 'exact', layer: 1, viewers: '1.2k' },
  { id: 'belgrade', name: 'Belgrade', lon: 20.5, lat: 44.8, p: 'approximate', layer: 2, viewers: '860' },
  { id: 'tehran', name: 'Tehran', lon: 51.4, lat: 35.7, p: 'inferred', layer: 3, viewers: '410' },
  { id: 'kyiv', name: 'Kyiv', lon: 30.5, lat: 50.4, p: 'exact', layer: 1, viewers: '2.4k' },
  { id: 'cairo', name: 'Cairo', lon: 31.2, lat: 30, p: 'approximate', layer: 2, viewers: '330' },
  { id: 'nairobi', name: 'Nairobi', lon: 36.8, lat: -1.3, p: 'exact', layer: 4, viewers: '298' },
  { id: 'lagos', name: 'Lagos', lon: 3.4, lat: 6.5, p: 'inferred', layer: 5, viewers: '412' },
  { id: 'paris', name: 'Paris', lon: 2.35, lat: 48.85, p: 'approximate', layer: 6, viewers: '1.9k' },
]
export const DEMO_CLUSTERS: GlobeCluster[] = [
  { id: 'istanbul', lon: 29, lat: 41, counts: [9, 6, 5, 4] },
  { id: 'beirut', lon: 35.5, lat: 33.9, counts: [4, 3, 2] },
]
