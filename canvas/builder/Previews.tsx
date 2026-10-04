// Wireframe previews for the layout categories (design editor only).
import type { CSSProperties } from 'react'
import { useDesign } from '../../gui_elements/context'
import { LAYOUTS, type LayoutRect } from '../../gui_elements/layouts'

const LABEL: Record<LayoutRect['k'], string> = { panel: 'LAYERS', dock: 'DETAIL', bar: 'ARGUS', card: '', rail: '', tab: '' }

function Box({ r, mode }: { r: LayoutRect; mode: number }) {
  const style: CSSProperties = {
    left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`,
    background: mode === 2 ? 'color-mix(in srgb, var(--color-panel) 55%, transparent)' : 'var(--color-panel)',
    backdropFilter: mode === 2 ? 'blur(4px)' : undefined,
    opacity: mode === 3 ? 0.35 : 1,
    borderLeft: r.k === 'panel' || r.k === 'dock' ? '2px solid var(--color-accent-2)' : undefined,
  }
  return (
    <div className="absolute border border-line transition-all duration-(--dur) ease-(--ease)" style={style}>
      {LABEL[r.k] && <span className="sub absolute top-1 left-1.5 text-[7px] text-dim">{LABEL[r.k]}</span>}
      {(r.k === 'panel' || r.k === 'card') && (
        <div className="absolute inset-x-1.5 top-4 flex flex-col gap-1">{[70, 50, 60].map((w, i) => <span key={i} className="h-1 bg-line" style={{ width: `${w}%` }} />)}</div>
      )}
    </div>
  )
}

/** Mini 16:9 screen showing the chosen layout and how panels sit against the globe. */
export function ScreenPreview() {
  const d = useDesign()
  const L = LAYOUTS[d.layout]
  const g = d.zorder === 1 ? L.docked : L.float
  return (
    <div className="stage relative aspect-video w-full overflow-hidden border border-line">
      <div
        className="absolute rounded-full border border-accent-2/60 transition-all duration-(--dur) ease-(--ease)"
        style={{
          left: `${g.cx}%`, top: `${g.cy}%`, width: `${g.r * 0.5625 * 2}%`, aspectRatio: '1', translate: '-50% -50%',
          background: 'radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--color-accent-2) 22%, transparent), transparent 70%)',
        }}
      />
      {L.panels.map((r, i) => <Box key={i} r={r} mode={d.zorder} />)}
      {d.zorder === 3 && <span className="sub absolute right-1.5 bottom-1 text-[7px] text-dim">panels appear on hover</span>}
    </div>
  )
}

/** Mini phone screen showing the mobile fallback. */
export function PhonePreview() {
  const v = useDesign().responsive
  const panel = 'absolute border border-line bg-panel'
  return (
    <div className="stage relative aspect-[9/19] w-[88px] overflow-hidden rounded-[10px] border-2 border-line">
      <div className="absolute top-[28%] left-1/2 aspect-square w-[80%] -translate-x-1/2 rounded-full border border-accent-2/60" style={{ background: 'radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--color-accent-2) 22%, transparent), transparent 70%)' }} />
      <div className="absolute inset-x-0 top-0 h-[6%] border-b border-line bg-panel" />
      {v === 0 && <div className={`${panel} top-[6%] bottom-0 left-0 flex w-[14%] flex-col items-center gap-1.5 pt-2`}>{[0, 1, 2, 3].map((i) => <span key={i} className="size-1.5 bg-dim" />)}</div>}
      {v === 1 && <div className={`${panel} inset-x-0 bottom-0 h-[42%] rounded-t-[8px]`}><span className="mx-auto mt-1 block h-0.5 w-5 bg-dim" /></div>}
      {v === 2 && <div className={`${panel} inset-x-0 bottom-0 flex h-[8%] items-center justify-around`}>{[0, 1, 2, 3].map((i) => <span key={i} className={`size-1.5 ${i === 0 ? 'bg-accent' : 'bg-dim'}`} />)}</div>}
      {v === 3 && <><div className="absolute inset-0 bg-black/50" /><div className={`${panel} top-0 bottom-0 left-0 w-[72%] border-l-2 border-l-accent-2`} /></>}
      {v === 4 && <><div className="absolute inset-0 bg-black/40" /><div className={`${panel} inset-x-[8%] top-[30%] h-[40%] border-t-2 border-t-accent-2`} /></>}
    </div>
  )
}
