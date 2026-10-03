import type { DetailProps } from '../../core/types'
import { LAYERS } from '../index'

/** An alert is the original feature seen through a watch: banner + the origin layer's own view. */
export function WatchDetail({ feature, select }: DetailProps) {
  const p = feature.props
  const origin = LAYERS.find((l) => l.id === p.originLayer)
  const original = { ...feature, id: String(p.originId), layerId: String(p.originLayer) }
  return (
    <div>
      <div className="watch-banner">
        <b>◎ {String(p.watchName)}</b>
        <span>
          {String(p.km)} km from centre · {origin?.label ?? String(p.originLayer)}
          {p.change ? ` · ${String(p.change)}` : ''}
        </span>
      </div>
      {origin ? <origin.Detail feature={original} select={select} /> : null}
    </div>
  )
}
