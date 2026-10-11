import type { ControlsProps } from '../../core/types'
import { exposureColor } from './props'

/** Most-exposed countries per category (aggregate counts from Shodan, no individual hosts). */
export function ExposureBoard({ features = [], select }: ControlsProps) {
  const cats = new Map<string, { label: string; rows: typeof features }>()
  for (const f of features) {
    const cat = String(f.props.category)
    const g = cats.get(cat) ?? { label: String(f.props.categoryLabel ?? cat), rows: [] }
    g.rows.push(f)
    cats.set(cat, g)
  }
  return (
    <div className="fin-board">
      {[...cats.entries()].map(([cat, g]) => {
        const rows = [...g.rows].sort((a, b) => Number(b.props.count) - Number(a.props.count)).slice(0, 6)
        const max = Number(rows[0]?.props.count) || 1
        return (
          <div key={cat}>
            <small>Most exposed: {g.label.toLowerCase()}</small>
            {rows.map((f) => (
              <button key={f.id} onClick={() => select?.(f.id)}>
                <span>{String(f.props.country)}</span>
                <span style={{ background: `linear-gradient(90deg, ${exposureColor(cat)} ${(Number(f.props.count) / max) * 100}%, transparent 0)`, height: 4, flex: 1, margin: '0 8px', borderRadius: 2 }} />
                <b>{Number(f.props.count).toLocaleString()}</b>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
