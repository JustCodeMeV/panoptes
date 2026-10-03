import { useDesign } from './context'

// Variant-specific pieces; the look lives in styles.css (.tg-1 … .tg-10).
const CLIP: Record<number, [string, string]> = { 0: ['chamfer', 'chamfer'], 7: ['chamfer4', 'chamfer4'], 8: ['chamfer', 'chamfer'], 6: ['', 'hexclip'] }

function Inner({ v, on }: { v: number; on: boolean }) {
  const k = <span className={`k ${CLIP[v]?.[1] ?? ''}`} />
  switch (v) {
    case 1: return <><span className="trail" />{k}</>
    case 2: return <><span className="s-off chamfer">OFF</span><span className="s-on chamfer">ON</span></>
    case 3: return <><b>[</b><span>{on ? 'ON' : 'OFF'}</span><b>]</b></>
    case 4: return <><span className="stripes" />{k}</>
    case 5: return <>{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ ['--i' as string]: i }} />)}</>
    case 6: return <><span className="n" /><span className="n" />{k}</>
    default: return k
  }
}

type Props = { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean; className?: string }

/** Layer on/off switch. Accessible name comes from `label`. */
export function Toggle({ checked, onChange, label, disabled, className = '' }: Props) {
  const v = useDesign().toggle
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`tg tg-${v + 1} ${CLIP[v]?.[0] ?? ''} ${checked ? 'on g-el' : ''} disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      <Inner v={v} on={checked} />
    </button>
  )
}
