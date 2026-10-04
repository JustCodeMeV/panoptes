import { Marker } from '../../gui_elements/Controls'
import type { LayerDef } from '../core/types'

const PRECISION = [
  ['exact', 'Exact', 'coordinates given by the source'],
  ['approximate', 'Approximate', 'area or country centre'],
  ['inferred', 'Inferred', 'place read from the text'],
] as const

/** The map key: what a pin's shape says about its position, and what each active layer's colours mean. */
export function Key({ layers }: { layers: LayerDef[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <span className="sub t-caption text-accent">Position</span>
        {PRECISION.map(([p, label, hint]) => (
          <span key={p} className="t-caption flex items-center gap-2 text-dim">
            <Marker p={p} size={13} />
            <span className="sub">{label}</span>
            <span className="normal-case">· {hint}</span>
          </span>
        ))}
      </div>
      {layers.length === 0 && <p className="t-caption text-dim">Turn a layer on to see its colours.</p>}
      {layers.map((l) => (
        <div key={l.id} className="flex flex-col gap-1">
          <span className="sub t-caption flex items-center gap-2 text-accent">
            <span className="inline-block size-2 flex-none" style={{ background: l.color }} />
            {l.label}
          </span>
          {l.legend?.map(([label, color]) => (
            <span key={label} className="t-caption flex items-center gap-2 pl-4 text-dim">
              <span className="inline-block size-2 flex-none rounded-full" style={{ background: color }} />
              <span className="normal-case">{label}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
