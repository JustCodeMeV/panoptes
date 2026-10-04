import { useEffect, useState, type CSSProperties } from 'react'
import { useInvestigation } from '../core/investigation'
import { Button } from '../../gui_elements/Button'
import { durationMs } from '../../gui_elements/catalog'
import { Dock } from '../../gui_elements/Composites'
import { useDesign } from '../../gui_elements/context'
import { DockTransition, RollUp } from '../../gui_elements/Motion'
import { Panel } from '../../gui_elements/Panel'
import { useCases } from '../core/cases'
import { featuresOf, useSelected, useStore } from '../core/store'
import { LAYERS } from '../layers'
import { useShell, type PanelBox } from './shell'

/**
 * Right dock for the selected feature. Opening waits for the globe controls to move back from the
 * right edge; minimising rolls it up to its header, then the controls glide out to the edge again.
 */
export function DetailDock({ box }: { box: PanelBox }) {
  const selected = useSelected()
  const select = useStore((s) => s.select)
  const stack = useStore((s) => s.stack)
  const layers = useStore((s) => s.layers)
  const addToCase = useCases((s) => s.add)
  const toast = useCases((s) => s.toast)
  const dur = durationMs(useDesign())
  const dockMin = useShell((s) => s.dockMin)
  const dockShown = useShell((s) => s.dockShown)
  const setShell = useShell((s) => s.set)

  // Keep the last feature so the dock can play its exit animation after the selection clears
  const [feature, setFeature] = useState(selected)
  if (selected && selected !== feature) setFeature(selected)

  const has = !!selected
  useEffect(() => {
    if (has) {
      if (dockShown) return
      const wasOut = useShell.getState().toolOut
      setShell({ toolOut: false })
      const t = setTimeout(() => setShell({ dockShown: true }), wasOut ? dur : 0)
      return () => clearTimeout(t)
    }
    if (dockShown) setShell({ dockShown: false, dockMin: false })
    const t = setTimeout(() => setShell({ toolOut: true }), dur)
    return () => clearTimeout(t)
  }, [has, dockShown, dur, setShell])

  const minimise = () => {
    setShell({ dockMin: true })
    setTimeout(() => setShell({ toolOut: true }), dur)
  }
  const restore = () => {
    setShell({ toolOut: false })
    setTimeout(() => setShell({ dockMin: false }), dur)
  }
  // Picking another feature while minimised brings the dock back
  const selectedId = selected?.id
  useEffect(() => {
    if (selectedId && useShell.getState().dockMin) restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const def = feature && LAYERS.find((l) => l.id === feature.layerId)
  const Detail = def?.Detail
  const allFeatures = stack.length > 1 ? Object.values(layers).flatMap(featuresOf) : []

  return (
    <div className="pointer-events-none absolute z-10" style={{ right: box.inset, top: box.top, width: box.width, height: box.height }}>
      <div className="pointer-events-auto">
        <DockTransition show={has && dockShown}>
          {feature && def && Detail && (
            <RollUp minimized={dockMin}>
              <Panel style={{ '--c': def.color } as CSSProperties}>
                <div className="dock-body overflow-y-auto pr-1" style={{ maxHeight: `calc(${box.height} - 2 * var(--pad) - 4px)` }}>
                  <Dock kind={def.label} title={feature.title} onClose={() => select(null)} minimized={dockMin} onMinimize={dockMin ? restore : minimise}>
                    {stack.length > 1 && (
                      <div className="mb-3 flex max-h-36 flex-col gap-0.5 overflow-y-auto border border-line p-2">
                        <span className="sub t-label mb-1 text-dim">{stack.length} items at this location</span>
                        {stack.map((id) => {
                          const f = allFeatures.find((x) => x.id === id)
                          return f ? (
                            <button
                              key={id}
                              type="button"
                              onClick={() => select(id)}
                              className={`t-caption cursor-pointer truncate px-1.5 py-1 text-left ${id === feature.id ? 'bg-accent-2/15 text-accent' : 'hover:bg-ink/5'}`}
                            >
                              {f.title}
                            </button>
                          ) : null
                        })}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void addToCase(feature)}>
                        {toast ?? '＋ Add to case'}
                      </Button>
                      <Button variant="secondary" onClick={() => void useInvestigation.getState().seed(feature.id)} title="Open this item as entities (events, places, actors, sources, claims) and expand them">
                        ◆ Investigate
                      </Button>
                    </div>
                    <div className="mt-3">
                      <Detail feature={feature} select={select} />
                    </div>
                  </Dock>
                </div>
              </Panel>
            </RollUp>
          )}
        </DockTransition>
      </div>
    </div>
  )
}
