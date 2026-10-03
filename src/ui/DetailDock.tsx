import { LAYERS } from '../layers'
import { useSelected, useStore } from '../core/store'

export function DetailDock() {
  const feature = useSelected()
  const select = useStore((s) => s.select)
  if (!feature) return null
  const def = LAYERS.find((l) => l.id === feature.layerId)
  if (!def) return null
  const Detail = def.Detail
  return (
    <aside className="dock" style={{ ['--c' as string]: def.color }}>
      <button className="close" onClick={() => select(null)} aria-label="Close">
        ×
      </button>
      <div className="dock-kind">{def.label}</div>
      <Detail feature={feature} />
    </aside>
  )
}
