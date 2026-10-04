import type { ControlsProps } from '../../core/types'
import { moveColor, pct, price } from './props'

const GROUPS: [string, string[]][] = [
  ['Indices', ['index', 'volatility']],
  ['Commodities', ['commodity']],
  ['Currencies', ['fx']],
  ['Crypto & defence', ['crypto', 'defence']],
]

/** Compact market board in the layer panel: every instrument, today's move, click to open. */
export function MarketsBoard({ features: fs = [], select }: ControlsProps) {
  if (!fs.length) return null
  return (
    <div className="fin-board">
      {GROUPS.map(([label, kinds]) => (
        <div key={label}>
          <small>{label}</small>
          {fs
            .filter((f) => kinds.includes(String(f.props.kind)))
            .map((f) => (
              <button key={f.id} onClick={() => select?.(f.id)} title={String(f.props.sym)}>
                <span>{String(f.props.name)}</span>
                <span>{price(f.props.price)}</span>
                <b style={{ color: moveColor(Number(f.props.day)) }}>{pct(f.props.day)}</b>
              </button>
            ))}
        </div>
      ))}
    </div>
  )
}
