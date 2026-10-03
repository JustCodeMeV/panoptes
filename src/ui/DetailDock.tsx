import { LAYERS } from '../layers'
import { useCases } from '../core/cases'
import { featuresOf, useSelected, useStore } from '../core/store'

export function DetailDock() {
  const feature = useSelected()
  const select = useStore((s) => s.select)
  const stack = useStore((s) => s.stack)
  const addToCase = useCases((s) => s.add)
  const toast = useCases((s) => s.toast)
  const layers = useStore((s) => s.layers)
  if (!feature) return null
  const def = LAYERS.find((l) => l.id === feature.layerId)
  if (!def) return null
  const Detail = def.Detail
  return (
    <aside className="dock" style={{ ['--c' as string]: def.color }}>
      <button className="close" onClick={() => select(null)} aria-label="Close">
        ×
      </button>
      {stack.length > 1 && (
        <div className="stack">
          <span>{stack.length} items at this location</span>
          {stack.map((id) => {
            const f = Object.values(layers).flatMap(featuresOf).find((x) => x.id === id)
            return f ? (
              <button key={id} className={id === feature.id ? 'on' : ''} onClick={() => select(id)}>
                {f.title}
              </button>
            ) : null
          })}
        </div>
      )}
      <div className="dock-kind">
        {def.label}
        <button className="addcase" onClick={() => void addToCase(feature)}>{toast ?? '＋ Add to case'}</button>
      </div>
      <Detail feature={feature} select={select} />
    </aside>
  )
}
