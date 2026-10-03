import { useRef, useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from 'react'
import { useDesign } from './context'

/* ---------------- Search ---------------- */

const Glass = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
)

/** Search field. Uncontrolled unless value/onChange are passed. */
export function Search({ placeholder = 'Search places, streams, sources', value, onChange, label = 'Search' }: { placeholder?: string; value?: string; onChange?: (v: string) => void; label?: string }) {
  const v = useDesign().search
  const [own, setOwn] = useState('')
  const q = value ?? own
  const input = <input value={q} onChange={(e) => (onChange ? onChange(e.target.value) : setOwn(e.target.value))} placeholder={placeholder} aria-label={label} />
  const cls = `sr sr-${v + 1} ${v === 0 || v === 8 ? 'chamfer' : ''} ${v === 7 ? 'ticks4' : ''}`
  switch (v) {
    case 1:
      return <label className={cls}><span className="pr">&gt;</span>{input}</label>
    case 2:
      return <label className={cls}><b>[</b><Glass />{input}<b>]</b></label>
    case 6:
      return <label className={cls}><span className="lb">SRCH</span>{input}</label>
    case 8:
      return <label className={cls}><Glass />{input}<kbd>⌘K</kbd></label>
    default:
      return <label className={cls}><Glass />{input}</label>
  }
}

/** Plain text input in the same style as Search, without the search icon. */
export function TextField({ placeholder, value, onChange, label }: { placeholder?: string; value: string; onChange: (v: string) => void; label: string }) {
  const v = useDesign().search
  return (
    <label className={`sr sr-${v + 1} ${v === 0 || v === 8 ? 'chamfer' : ''} ${v === 7 ? 'ticks4' : ''}`}>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
    </label>
  )
}

/** Dropdown in the input style. */
export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const v = useDesign().search
  return (
    <label className={`sr sr-${v + 1} ${v === 0 || v === 8 ? 'chamfer' : ''} ${v === 7 ? 'ticks4' : ''}`}>
      <select aria-label={label} className="sel min-w-0 flex-1 cursor-pointer appearance-none bg-transparent outline-none" {...props}>
        {children}
      </select>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M4 6L8 10L12 6" /></svg>
    </label>
  )
}

/* ---------------- Slider ---------------- */

export function Slider({ value, onChange, min = 1, max = 24, label = 'Time window (hours)' }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label?: string }) {
  const v = useDesign().slider
  const ref = useRef<HTMLDivElement>(null)
  const p = (value - min) / (max - min)
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    onChange(Math.round(min + t * (max - min)))
  }
  const steps = max - min + 1
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`sl sl-${v + 1}`}
      style={{ '--p': p } as CSSProperties}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e.clientX)
      }}
      onPointerMove={(e) => e.buttons && set(e.clientX)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(max, value + 1))
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(min, value - 1))
      }}
    >
      {v === 2 || v === 7 ? (
        Array.from({ length: steps }, (_, i) => (
          <i key={i} className={`${i + min <= value ? 'on' : ''} ${v === 7 && i + min === value ? 'cur' : ''}`} />
        ))
      ) : (
        <>
          <span className="tr" />
          <span className="fi" />
          <span className={`th ${v === 0 ? 'chamfer cut4' : ''} ${v === 8 ? 'hexclip' : ''}`}>{v === 3 ? '[|]' : null}</span>
          {v === 9 && (
            <span className="lbl">
              <span>-24h</span>
              <span>-12h</span>
              <span>now</span>
            </span>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- Precision markers ---------------- */

/** Where a feature's position comes from; 'none' = not placed on the map. */
export type Precision = 'exact' | 'approximate' | 'inferred' | 'none'

const DASH = { strokeDasharray: '2.5 2' }
const HEX = (r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i
    return `${12 + r * Math.cos(a)},${12 + r * Math.sin(a)}`
  }).join(' ')
const CHAMF = (h: number, c: number) =>
  `${12 - h + c},${12 - h} ${12 + h},${12 - h} ${12 + h},${12 + h - c} ${12 + h - c},${12 + h} ${12 - h},${12 + h} ${12 - h},${12 - h + c}`

function markerShape(v: number, p: Precision): ReactNode {
  if (p === 'none') return <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.5} />
  const ex = p === 'exact'
  const ap = p === 'approximate'
  const S = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }
  switch (v) {
    case 0:
      return ex ? <rect x="8" y="8" width="8" height="8" fill="currentColor" />
        : ap ? <><rect x="9" y="9" width="6" height="6" fill="currentColor" /><rect x="5" y="5" width="14" height="14" {...S} opacity=".6" /></>
        : <rect x="7.5" y="7.5" width="9" height="9" {...S} {...DASH} fill="currentColor" fillOpacity=".25" />
    case 1:
      return ex ? <polygon points="12,6 18,12 12,18 6,12" fill="currentColor" />
        : ap ? <><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".2" /><polygon points="12,8 16,12 12,16 8,12" fill="currentColor" /></>
        : <polygon points="12,6 18,12 12,18 6,12" {...S} {...DASH} />
    case 2:
      return ex ? <><path d="M12 3V9M12 15V21M3 12H9M15 12H21" {...S} /><circle cx="12" cy="12" r="2" fill="currentColor" /></>
        : ap ? <><path d="M12 3V7M12 17V21M3 12H7M17 12H21" {...S} /><circle cx="12" cy="12" r="5" {...S} /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></>
        : <><path d="M12 4V7M12 17V20M4 12H7M17 12H20" {...S} opacity=".7" /><circle cx="12" cy="12" r="5" {...S} {...DASH} /></>
    case 3:
      return ex ? <polygon points={CHAMF(5, 2.5)} fill="currentColor" />
        : ap ? <><polygon points={CHAMF(4, 2)} fill="currentColor" /><polygon points={CHAMF(8.5, 4)} {...S} opacity=".6" /></>
        : <polygon points={CHAMF(6, 3)} {...S} {...DASH} />
    case 4:
      return ex ? <><circle className="pulse" cx="12" cy="12" r="4" fill="currentColor" /><circle cx="12" cy="12" r="4" fill="currentColor" /></>
        : ap ? <><circle cx="12" cy="12" r="8" {...S} opacity=".5" /><circle cx="12" cy="12" r="3.5" fill="currentColor" /></>
        : <><circle cx="12" cy="12" r="8" {...S} {...DASH} opacity=".6" /><circle cx="12" cy="12" r="3" fill="currentColor" opacity=".5" /></>
    case 5: {
      const br = <path d="M7 5H4V19H7M17 5H20V19H17" {...S} {...(p === 'inferred' ? DASH : {})} />
      return <>{br}{ex ? <rect x="9" y="9" width="6" height="6" fill="currentColor" /> : ap ? <rect x="9" y="9" width="6" height="6" {...S} /> : <circle cx="12" cy="12" r="1.5" fill="currentColor" />}</>
    }
    case 6:
      return ex ? <polygon points="12,5 19,18 5,18" fill="currentColor" />
        : ap ? <><circle cx="12" cy="13" r="10" {...S} opacity=".5" /><polygon points="12,8 16,16 8,16" fill="currentColor" /></>
        : <polygon points="12,5 19,18 5,18" {...S} {...DASH} />
    case 7:
      return ex ? <><circle cx="12" cy="12" r="7" {...S} /><circle cx="12" cy="12" r="3" fill="currentColor" /></>
        : ap ? <><circle cx="12" cy="12" r="7" {...S} /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>
        : <><circle cx="12" cy="12" r="7" {...S} {...DASH} /><text x="12" y="15" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="currentColor">?</text></>
    case 8:
      return ex ? <polygon points={HEX(6)} fill="currentColor" />
        : ap ? <><polygon points={HEX(7)} {...S} /><circle cx="12" cy="12" r="2" fill="currentColor" /></>
        : <polygon points={HEX(6.5)} {...S} {...DASH} />
  }
  return null
}

/** Geo-precision marker: exact / approximate / inferred. */
export function Marker({ p, size = 22, color }: { p: Precision; size?: number; color?: string }) {
  const v = useDesign().marker
  if (v === 9)
    return (
      <span className={`mk mk-tag ${p}`} title={p} style={color ? { color } : undefined}>
        {p === 'exact' ? '◆ EX' : p === 'approximate' ? '◈ AP' : p === 'inferred' ? '◇ IN' : '○ —'}
      </span>
    )
  return (
    <span className="mk" title={p} style={color ? { color } : undefined}>
      <svg width={size} height={size} viewBox="0 0 24 24">{markerShape(v, p)}</svg>
    </span>
  )
}

/** The marker drawn inside an SVG (globe pins). Centred on x, y. */
export function MarkerGlyph({ p, x, y, size = 16, color }: { p: Precision; x: number; y: number; size?: number; color: string }) {
  const v = useDesign().marker
  if (v === 9)
    return (
      <text x={x} y={y + 3} textAnchor="middle" fontSize={size * 0.5} fontFamily="var(--font-mono)" fontWeight={600} style={{ fill: color }}>
        {p === 'exact' ? '◆EX' : p === 'approximate' ? '◈AP' : p === 'inferred' ? '◇IN' : '○'}
      </text>
    )
  return (
    <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 0 24 24" overflow="visible" style={{ color }}>
      {markerShape(v, p)}
    </svg>
  )
}

/* ---------------- Tooltip ---------------- */

/** Hover info box, positioned above its (relative) parent. */
export function Tooltip({ title, sub }: { title: string; sub: string }) {
  const v = useDesign().tooltip
  const body = (
    <>
      <div className="t">{title}</div>
      <div className="s">{sub}</div>
    </>
  )
  const cls = `tt tt-${v + 1} ${v === 0 ? 'chamfer' : ''} ${v === 7 ? 'ticks4' : ''}`
  switch (v) {
    case 1:
      return (
        <div className={cls}>
          <svg className="ld" aria-hidden>
            <polyline points="0,22 12,0 32,0" fill="none" stroke="var(--color-accent-2)" strokeWidth="1" />
          </svg>
          {body}
        </div>
      )
    case 2:
      return <div className={cls}><b>[</b><div>{body}</div><b>]</b></div>
    case 3:
      return <div className={cls}><div className="t">{title}</div></div>
    case 6:
      return (
        <div className={cls}>
          <div className="t">&gt; {title.toLowerCase()} <span className="caret" /></div>
          <div className="s">{sub}</div>
        </div>
      )
    case 9:
      return (
        <div className={cls}>
          <div className="hd">STREAM</div>
          <div className="bd2">{body}</div>
        </div>
      )
    default:
      return <div className={cls}>{body}</div>
  }
}

/* ---------------- Icon controls ---------------- */

const ICONS = {
  collapse: <path d="M3 8H13" />,
  next: <path d="M6 3L11 8L6 13" />,
  more: <path d="M3 8H3.5M8 8H8.5M13 8H13.5" strokeWidth="2.6" />,
  close: <path d="M4 4L12 12M12 4L4 12" />,
  expand: <path d="M3.5 6L8 10.5L12.5 6" />,
}
const WORDS = { collapse: 'Minimise', next: 'Next', more: 'More', close: 'Close', expand: 'Expand' }
const GLYPHS = { collapse: '–', next: '›', more: '⋯', close: '×', expand: '▾' }

export function IconButton({ icon, onClick }: { icon: keyof typeof ICONS; onClick?: () => void }) {
  const v = useDesign().icons
  const cls = `ic ic-${v + 1} ${v === 0 || v === 9 ? 'chamfer' : ''} ${v === 6 ? 'hexclip' : ''} ${v === 7 ? 'ticks4' : ''}`
  return (
    <button type="button" className={cls} aria-label={WORDS[icon]} title={WORDS[icon]} onClick={onClick}>
      {v === 1 ? (
        <><b>[</b>{GLYPHS[icon]}<b>]</b></>
      ) : v === 8 ? (
        WORDS[icon]
      ) : (
        <svg viewBox="0 0 16 16">{ICONS[icon]}</svg>
      )}
    </button>
  )
}

export function IconSet() {
  return (
    <span className="flex items-center gap-1.5">
      {(['collapse', 'next', 'more', 'close'] as const).map((k) => (
        <IconButton key={k} icon={k} />
      ))}
    </span>
  )
}

/* ---------------- Checkbox / radio ---------------- */

const Tick = () => (
  <svg viewBox="0 0 12 12" aria-hidden>
    <path d="M2 6.5L5 9L10 3" />
  </svg>
)

/** Checkbox, or radio with `radio`. */
export function Check({ checked, onChange, label, radio = false }: { checked: boolean; onChange: () => void; label: ReactNode; radio?: boolean }) {
  const v = useDesign().check
  let box: ReactNode = null
  if (v === 0) box = radio ? null : <Tick />
  if (v === 1) box = radio ? (checked ? '(•)' : '( )') : checked ? '[x]' : '[ ]'
  if (v === 8) box = radio ? (checked ? '◉' : '○') : checked ? '■' : '□'
  return (
    <button
      type="button"
      role={radio ? 'radio' : 'checkbox'}
      aria-checked={checked}
      onClick={onChange}
      className={`ck ck-${v + 1} ${checked ? 'on' : ''} ${radio ? 'radio' : ''}`}
    >
      <span className={`bx ${v === 0 && !radio ? 'chamfer' : ''}`} style={v === 0 && !radio ? { '--cut': '4px' } as CSSProperties : undefined}>
        {box}
      </span>
      {label}
    </button>
  )
}
