// Composite ATLAS components. Each reads its variant from the active design (useDesign).
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useDesign } from './context'
import { Badge, type Tone } from './Badge'
import { Button } from './Button'
import { IconButton, Marker, type Precision } from './Controls'
import { Icon } from './Icon'
import { Toggle } from './Toggle'

/** `color` is a CSS colour, or a 1-based index into the design's layer palette. `extra` shows when the layer is expanded. */
export type Layer = { id: string; label: string; count: number | string; on: boolean; desc: string; status: string; color: number | string; spark?: number[]; extra?: ReactNode }
export type FeedEntry = { id: string; title: string; sub: string; p: Precision; time: string; viewers: string; color?: string }
export type MetaItem = { k: string; v: string }

const layerColor = (c: number | string) => (typeof c === 'number' ? `var(--layer-${c})` : c)

/* ---------------- Header / wordmark ---------------- */

export function Header({ name = 'ATLAS', tagline = 'Unrest & influence, mapped live' }: { name?: string; tagline?: string }) {
  const v = useDesign().header
  const word = <span className="title-weight g-text t-title font-title tracking-(--tracking-title) whitespace-nowrap text-white">{name}</span>
  const tag = <span className="sub t-caption text-dim">{tagline}</span>
  switch (v) {
    case 0: return <div>{word}</div>
    case 2: return <div className="flex items-center gap-2"><span className="t-title font-mono text-accent-2">[</span>{word}<span className="t-title font-mono text-accent-2">]</span></div>
    case 3: return <div className="flex items-stretch gap-3"><span className="w-1 bg-accent-2" /><div className="flex flex-col">{word}{tag}</div></div>
    case 4:
      return (
        <div className="flex items-center gap-2">
          <span className="lcars-cap bg-accent px-4 py-1"><span className="title-weight t-h font-title tracking-(--tracking-title) text-bg">{name}</span></span>
          <span className="h-3 flex-1 bg-accent-2/70" />
          <span className="sub t-label text-accent-2">{tagline.split(',')[0]}</span>
        </div>
      )
    case 5: return <div className="relative inline-flex items-center">{word}<span className="absolute top-1/2 -right-2 -left-2 h-[2px] -rotate-6 bg-alert/80" /><span className="sub t-label ml-4 text-alert">// live</span></div>
    case 6: return <div className="flex flex-col">{word}<span className="sub t-label mt-1 text-dim">v0.3 · open-source intelligence</span></div>
    case 7:
      return (
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="size-[calc(var(--fs-title)*1.3)] text-accent-2" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="16" cy="16" r="13" /><ellipse cx="16" cy="16" rx="13" ry="5.5" /><circle cx="16" cy="16" r="3.5" fill="currentColor" />
          </svg>
          <div className="flex flex-col">{word}{tag}</div>
        </div>
      )
    case 8: return <div className="caret-b t-title font-mono text-accent">&gt; {name.toLowerCase()}</div>
    case 9: return <div className="chamfer inline-block bg-accent px-4 py-1.5"><span className="title-weight t-title font-title tracking-(--tracking-title) text-bg">{name}</span></div>
    default: return <div className="flex flex-col">{word}{tag}</div>
  }
}

/* ---------------- Fold (collapsible section) ---------------- */

/** The ▾ toggle used by every foldable section. */
export function FoldToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      title={open ? 'Collapse' : 'Expand'}
      className="grid size-5 flex-none cursor-pointer place-items-center text-accent-2 transition-colors hover:text-accent"
    >
      <svg viewBox="0 0 10 10" className={`size-2.5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} aria-hidden>
        <path d="M1 3H9L5 8Z" fill="currentColor" />
      </svg>
    </button>
  )
}

/** Slides its content open and shut (height eases with the design's motion). */
export function FoldBody({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows] duration-(--dur) ease-(--ease) ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} inert={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** A titled section that folds shut: title, optional `aside` (chips, badges), then the ▾ toggle. */
export function Fold({ title, aside, children, defaultOpen = true, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={className}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} className="sub t-label min-w-0 flex-1 cursor-pointer text-left text-accent">
          {title}
        </button>
        {aside}
        <FoldToggle open={open} onToggle={() => setOpen(!open)} label={title} />
      </div>
      <FoldBody open={open}>
        <div className="pt-2">{children}</div>
      </FoldBody>
    </section>
  )
}

/* ---------------- Layer row & panel ---------------- */

function Spark({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data)
  return (
    <svg width="44" height="14" aria-hidden>
      <polyline fill="none" style={{ stroke: color }} strokeWidth="1.3" points={data.map((d, i) => `${(i / (data.length - 1)) * 44},${14 - (d / max) * 12}`).join(' ')} />
    </svg>
  )
}

export function LayerRow({ layer, onToggle }: { layer: Layer; onToggle: (on: boolean) => void }) {
  const v = useDesign().layerRow
  const tg = <Toggle checked={layer.on} onChange={onToggle} label={layer.label} />
  const title = <span className={`t-body flex-1 truncate font-semibold ${layer.on ? '' : 'text-dim'}`}>{layer.label}</span>
  const count = <Badge>{layer.count}</Badge>
  const dot = <span className="size-2 flex-none" style={{ background: layerColor(layer.color) }} />
  switch (v) {
    case 1: return <div className="flex items-center gap-m py-s">{dot}{title}{count}{tg}</div>
    case 2: return <div className="flex items-center gap-m py-s"><span className="t-h w-10 font-mono text-accent tabular-nums">{layer.count}</span>{title}{tg}</div>
    case 3:
      return (
        <div className="flex items-center gap-m py-s">
          {tg}
          <div className="min-w-0 flex-1"><div className={`t-body truncate font-semibold ${layer.on ? '' : 'text-dim'}`}>{layer.label}</div><div className="sub t-caption text-dim">{layer.status}</div></div>
          {count}
        </div>
      )
    case 4: return <div className="flex items-center gap-m border-l-[3px] py-s pl-2" style={{ borderColor: layerColor(layer.color) }}>{title}{count}{tg}</div>
    case 5: return <div className="flex items-center gap-m py-s">{tg}{title}<Spark data={layer.spark ?? [1, 2]} color={layerColor(layer.color)} />{count}</div>
    case 6:
      return (
        <button type="button" onClick={() => onToggle(!layer.on)} className="flex w-full cursor-pointer items-center gap-m py-s text-left">
          {title}<span className={`t-caption font-mono ${layer.on ? 'text-accent' : 'text-dim'}`}>{layer.on ? layer.count : 'off'}</span>
        </button>
      )
    default: return <div className="flex items-center gap-m py-s">{tg}{title}{count}</div>
  }
}

/** `heading={false}` drops the "Layers" label (when a Fold above already titles it). */
export function LayerPanel({ layers, onToggle, defaultOpen, heading = true }: { layers: Layer[]; onToggle: (id: string, on: boolean) => void; defaultOpen?: string; heading?: boolean }) {
  const v = useDesign().layerPanel
  const [open, setOpen] = useState<string | undefined>(defaultOpen ?? layers[0]?.id)
  const label = heading ? <div className="sub t-label mb-2 text-accent">Layers</div> : null
  switch (v) {
    case 1:
      return <div>{label}<div className="divide-y divide-line">{layers.map((l) => <LayerRow key={l.id} layer={l} onToggle={(on) => onToggle(l.id, on)} />)}</div></div>
    case 2:
      return (
        <div>
          {label}
          {layers.map((l) => (
            <div key={l.id} className="border-b border-line">
              <div className="flex items-center gap-2">
                <div className="flex-1"><LayerRow layer={l} onToggle={(on) => onToggle(l.id, on)} /></div>
                <button type="button" onClick={() => setOpen(open === l.id ? undefined : l.id)} className={`cursor-pointer text-dim transition-transform duration-(--dur) ${open === l.id ? 'rotate-90' : ''}`} aria-label="Expand"><Icon name="play" className="text-[9px]" /></button>
              </div>
              {open === l.id && <div className="pb-2"><p className="t-caption text-dim">{l.desc}</p>{l.extra}</div>}
            </div>
          ))}
        </div>
      )
    case 3: {
      const cur = layers.find((l) => l.id === open) ?? layers[0]
      return (
        <div>
          <div className="mb-3 flex gap-1 border-b border-line">
            {layers.map((l) => (
              <button key={l.id} type="button" onClick={() => setOpen(l.id)} className={`sub t-label -mb-px cursor-pointer border-b-2 px-2 py-1.5 ${l.id === cur.id ? 'border-accent text-accent' : 'border-transparent text-dim'}`}>{l.label}</button>
            ))}
          </div>
          <LayerRow layer={cur} onToggle={(on) => onToggle(cur.id, on)} />
          <p className="t-caption mt-1 text-dim">{cur.desc}</p>
          {cur.extra}
        </div>
      )
    }
    case 4:
      return (
        <div>
          {label}
          <div className="grid grid-cols-2 gap-s">
            {layers.map((l) => (
              <button key={l.id} type="button" onClick={() => onToggle(l.id, !l.on)} className={`cursor-pointer border p-2 text-left transition-colors ${l.on ? 'border-accent-2/60 bg-accent-2/10' : 'border-line'}`}>
                <div className="flex items-center justify-between"><span className="size-2" style={{ background: layerColor(l.color) }} /><span className="t-caption font-mono text-accent">{l.on ? l.count : '—'}</span></div>
                <div className={`t-body mt-2 font-semibold ${l.on ? '' : 'text-dim'}`}>{l.label}</div>
              </button>
            ))}
          </div>
        </div>
      )
    case 5:
      return (
        <div className="t-caption font-mono">
          <div className="mb-2 text-accent-2">$ atlas layers --list</div>
          {layers.map((l) => (
            <button key={l.id} type="button" onClick={() => onToggle(l.id, !l.on)} className="flex w-full cursor-pointer gap-2 py-0.5 text-left hover:text-accent">
              <span className={l.on ? 'text-accent' : 'text-dim'}>[{l.on ? 'ON ' : 'OFF'}]</span>
              <span className="flex-1 truncate uppercase">{l.label.replace(' ', '_')}</span>
              <span className="text-dim">{String(l.count).padStart(4, '.')}</span>
            </button>
          ))}
        </div>
      )
    case 6:
      return (
        <div className="flex flex-col gap-1">
          {layers.map((l) => (
            <button key={l.id} type="button" onClick={() => onToggle(l.id, !l.on)} className="flex cursor-pointer items-stretch gap-1 text-left">
              <span className={`lcars-cap w-10 ${l.on ? '' : 'opacity-30'}`} style={{ background: layerColor(l.color) }} />
              <span className={`sub t-label flex flex-1 items-center px-2 py-1.5 ${l.on ? 'bg-accent text-bg' : 'bg-line text-dim'}`}>{l.label}</span>
              <span className={`t-label flex w-12 items-center justify-end px-2 font-mono ${l.on ? 'bg-accent-2 text-bg' : 'bg-line text-dim'}`}>{l.count}</span>
            </button>
          ))}
        </div>
      )
    default:
      return (
        <div>
          {label}
          {layers.map((l) => (
            <div key={l.id} className="mb-2 border-b border-line pb-2">
              <LayerRow layer={l} onToggle={(on) => onToggle(l.id, on)} />
              <p className="t-caption text-dim">{l.desc}</p>
              {l.extra}
              {l.on && <p className="sub t-caption mt-1 text-accent-2">{l.status}</p>}
            </div>
          ))}
        </div>
      )
  }
}

/* ---------------- Feed item ---------------- */

export function FeedItem({ entry, selected = false, onClick }: { entry: FeedEntry; selected?: boolean; onClick?: () => void }) {
  const v = useDesign().feed
  const base = `w-full cursor-pointer text-left transition-colors duration-(--dur) ${selected ? 'bg-ink/[0.07]' : 'hover:bg-ink/[0.04]'}`
  const meta = <span className="sub t-caption block truncate text-dim">{[entry.viewers, entry.time, entry.sub].filter(Boolean).join(' · ')}</span>
  switch (v) {
    case 1:
      return (
        <button type="button" onClick={onClick} className={`${base} grid grid-cols-[72px_1fr] gap-s p-1.5`}>
          <span className="video crt block"><span className="crowd" /></span>
          <span className="min-w-0"><span className="t-body line-clamp-2 leading-snug font-medium">{entry.title}</span><span className="mt-1 flex items-center gap-2"><Badge tone="live">Live</Badge>{meta}</span></span>
        </button>
      )
    case 2: return <button type="button" onClick={onClick} className={`${base} flex items-center gap-s px-1.5 py-1`}><Marker p={entry.p} size={14} color={entry.color} /><span className="t-body flex-1 truncate">{entry.title}</span><span className="t-caption font-mono text-dim">{entry.time}</span></button>
    case 3:
      return (
        <button type="button" onClick={onClick} className={`${base} grid grid-cols-[38px_12px_1fr] gap-x-2 px-1.5 py-1.5`}>
          <span className="t-caption pt-0.5 font-mono text-dim">{entry.time}</span>
          <span className="relative flex justify-center"><span className="absolute inset-y-0 w-px bg-line" /><span className={`relative mt-1.5 size-2 ${selected ? 'bg-accent' : 'bg-dim'}`} /></span>
          <span className="min-w-0"><span className="t-body line-clamp-2 leading-snug">{entry.title}</span>{meta}</span>
        </button>
      )
    case 4: return <button type="button" onClick={onClick} className={`${base} t-caption flex gap-2 truncate px-1.5 py-1 font-mono uppercase`}><span className="text-accent">{entry.time}</span><span className="text-accent-2">{entry.sub}</span><span className="text-dim">›</span><span className="truncate">{entry.title}</span></button>
    case 5: return <button type="button" onClick={onClick} className={`${base} px-1.5 py-2`}><span className="block font-news text-[calc(var(--fs-h)*1.15)] leading-snug font-semibold text-white">{entry.title}</span>{meta}</button>
    case 6:
      return (
        <button type="button" onClick={onClick} className={`w-full cursor-pointer border-l-[3px] px-2 py-1.5 text-left transition-colors duration-(--dur) ${selected ? 'border-accent-2 bg-accent-2/10' : 'border-transparent hover:border-line'}`}>
          <span className="t-body line-clamp-2 leading-snug font-medium">{entry.title}</span>{meta}
        </button>
      )
    case 7:
      return (
        <button type="button" onClick={onClick} className="flex w-full cursor-pointer gap-1.5 px-0.5 py-1.5 text-left">
          <span className={`font-mono transition-colors duration-(--dur) ${selected ? 'text-accent-2' : 'text-transparent'}`}>[</span>
          <span className="min-w-0 flex-1"><span className="t-body line-clamp-2 leading-snug font-medium">{entry.title}</span>{meta}</span>
          <span className={`self-end font-mono transition-colors duration-(--dur) ${selected ? 'text-accent-2' : 'text-transparent'}`}>]</span>
        </button>
      )
    default:
      return (
        <button type="button" onClick={onClick} className={`${base} grid grid-cols-[16px_1fr] gap-s px-1.5 py-1.5`}>
          <span className="pt-0.5"><Marker p={entry.p} size={14} color={entry.color} /></span>
          <span className="min-w-0"><span className="t-body line-clamp-2 leading-snug font-medium">{entry.title}</span>{meta}</span>
        </button>
      )
  }
}

/* ---------------- Media frame ---------------- */

export function MediaFrame({ state = 'live', title = 'Tbilisi · Rustaveli Ave' }: { state?: 'live' | 'loading' | 'offline'; title?: string }) {
  const v = useDesign().media
  const inner = (
    <div className={`video ${v === 2 ? 'crt rounded-[10px]' : ''}`}>
      <span className="crowd" />
      {state === 'loading' && <div className="absolute inset-0 grid place-items-center bg-black/50"><span className="sub t-label typing text-accent">Buffering</span></div>}
      {state === 'offline' && <div className="noise absolute inset-0 grid place-items-center"><span className="sub t-h bg-black/70 px-2 text-alert" style={{ animation: 'glitch-text 2s infinite' }}>Signal lost</span></div>}
      {state === 'live' && v !== 4 && <div className="absolute inset-0 grid place-items-center text-[28px] text-white/70"><Icon name="play" /></div>}
      {v === 1 && (
        <>
          {['top-2 left-2 border-t-2 border-l-2', 'top-2 right-2 border-t-2 border-r-2', 'bottom-2 left-2 border-b-2 border-l-2', 'bottom-2 right-2 border-b-2 border-r-2'].map((c) => <span key={c} className={`absolute size-4 border-accent-2 ${c}`} />)}
          <span className="absolute top-3 left-8 flex items-center gap-1.5 font-mono text-[10px] text-white"><span className="rec" />REC</span>
          <span className="absolute right-8 bottom-3 font-mono text-[10px] text-white/80">00:42:10</span>
        </>
      )}
    </div>
  )
  switch (v) {
    case 3:
      return (
        <div className="relative">
          <div className="chamfer [--cut:14px]">{inner}</div>
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden><line x1="0" y1="14" x2="14" y2="0" stroke="var(--color-accent-2)" strokeWidth="2" /><line x1="100%" y1="100%" x2="100%" y2="100%" /></svg>
        </div>
      )
    case 4:
      return (
        <div className="bg-black">
          <div className="py-[6%]">{inner}</div>
          <div className="sub t-caption flex items-center gap-3 border-t border-line px-2 py-1.5 text-dim"><span className="rec" /><span className="text-ink">Live</span><span>1.2k watching</span><span className="ml-auto font-mono">00:42:10</span></div>
        </div>
      )
    case 5:
      return (
        <div className="relative">
          <div className="video opacity-40"><span className="crowd" /></div>
          <div className="absolute right-2 bottom-2 w-[48%] border border-accent-2/60 shadow-[0_8px_24px_rgba(0,0,0,.6)]">
            {inner}
            <div className="sub t-caption truncate bg-bg px-1.5 py-0.5 text-dim">{title}</div>
          </div>
        </div>
      )
    default:
      return inner
  }
}

/* ---------------- Metadata block ---------------- */

export function MetaBlock({ items }: { items: MetaItem[] }) {
  const v = useDesign().meta
  switch (v) {
    case 1: return <div className="grid grid-cols-2 gap-s">{items.map((m) => <div key={m.k} className="border border-line p-1.5"><div className="sub t-label text-dim">{m.k}</div><div className="t-caption mt-0.5 truncate font-mono text-ink">{m.v}</div></div>)}</div>
    case 2: return <div className="flex flex-wrap gap-1.5">{items.map((m) => <span key={m.k} className="t-caption border border-line px-1.5 py-0.5"><span className="sub text-dim">{m.k} </span><span className="font-mono">{m.v}</span></span>)}</div>
    case 3: return <pre className="t-caption font-mono leading-relaxed whitespace-pre-wrap text-dim">{items.map((m) => <div key={m.k}><span className="text-accent-2">{m.k.toLowerCase().replace(' ', '_')}</span>: <span className="text-ink">{m.v}</span></div>)}</pre>
    case 4: return <div className="grid grid-cols-2 gap-s">{items.map((m) => <div key={m.k}><div className="sub t-label mb-0.5 text-dim">{m.k}</div><div className="t-caption truncate border border-accent/30 bg-black px-1.5 py-1 font-mono tracking-wider text-accent [text-shadow:0_0_6px_var(--color-accent)]">{m.v}</div></div>)}</div>
    case 5:
      return (
        <div className="border-l border-line pl-3">
          {items.map((m) => (
            <div key={m.k} className="relative pb-2"><span className="absolute top-1 -left-[15.5px] size-1.5 bg-accent-2" /><div className="sub t-label text-dim">{m.k}</div><div className="t-caption font-mono">{m.v}</div></div>
          ))}
        </div>
      )
    default:
      return <dl className="t-caption">{items.map((m) => <div key={m.k} className="flex justify-between gap-3 border-b border-line/70 py-1"><dt className="sub text-dim">{m.k}</dt><dd className="truncate font-mono">{m.v}</dd></div>)}</dl>
  }
}

/* ---------------- Detail dock ---------------- */

/** Detail dock. With `onMinimize` it shows a minimise / expand button next to close. */
export function Dock({ kind = 'Live stream', title, media, children, onClose, onMinimize, minimized = false }: { kind?: string; title: string; media?: ReactNode; children?: ReactNode; onClose?: () => void; onMinimize?: () => void; minimized?: boolean }) {
  const v = useDesign().dock
  const [tab, setTab] = useState(0)
  // data-roll-keep marks what stays visible when the dock is rolled up
  const head = <h2 data-roll-keep className="t-h mt-2 leading-snug font-semibold text-white">{title}</h2>
  const buttons = (
    <span className="flex items-center gap-1">
      {onMinimize && <IconButton icon={minimized ? 'expand' : 'collapse'} onClick={onMinimize} />}
      <IconButton icon="close" onClick={onClose} />
    </span>
  )
  switch (v) {
    case 1:
      return (
        <div>
          <div className="flex items-center gap-1 border-b border-line">
            {['Watch', 'Info', 'Sources'].map((t, i) => <button key={t} type="button" onClick={() => setTab(i)} className={`sub t-label -mb-px cursor-pointer border-b-2 px-2 py-1.5 ${tab === i ? 'border-accent text-accent' : 'border-transparent text-dim'}`}>{t}</button>)}
            <span className="ml-auto">{buttons}</span>
          </div>
          {head}
          <div className="mt-2">{tab === 0 ? media : tab === 1 ? children : <p className="t-caption text-dim">youtube-api · youtube-scrape · seed</p>}</div>
        </div>
      )
    case 2:
      return (
        <div>
          <div className="relative [margin:calc(var(--pad)*-1)_calc(var(--pad)*-1)_0]">{media}<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 to-transparent px-3 pt-8 pb-2"><div className="sub t-label text-accent">{kind}</div>{head}</div><span className="absolute top-2 right-2">{buttons}</span></div>
          <div className="mt-3">{children}</div>
        </div>
      )
    case 3:
      return (
        <div className="grid grid-cols-[1fr_auto] gap-x-2">
          <div className="sub t-label text-accent">{kind}</div>{buttons}
          <div className="col-span-2">{head}</div>
          <div className="col-span-2 mt-2 grid grid-cols-[3fr_2fr] gap-3"><div>{media}</div><div>{children}</div></div>
        </div>
      )
    case 4:
      return (
        <div>
          <div className="t-caption flex items-center justify-between font-mono text-accent-2"><span>&gt; feature yt:7f3a91 --open</span>{buttons}</div>
          <h2 data-roll-keep className="t-h mt-1 font-mono leading-snug text-accent">{title}</h2>
          <div className="mt-2">{media}</div>
          <div className="mt-2">{children}</div>
        </div>
      )
    case 5:
      return (
        <div className="flex gap-3">
          <div className="flex w-7 flex-none flex-col gap-1"><span className="lcars-cap h-8 rotate-180 bg-accent [border-radius:0_0_99px_99px]" /><span className="flex-1 bg-accent-2/70" /><span className="h-6 bg-line" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between"><span className="sub t-label bg-accent px-2 py-0.5 text-bg">{kind}</span>{buttons}</div>
            {head}<div className="mt-2">{media}</div><div className="mt-2">{children}</div>
          </div>
        </div>
      )
    default:
      return (
        <div>
          <div className="flex items-center justify-between"><span className="sub t-label text-accent">{kind}</span>{buttons}</div>
          {head}
          <div className="mt-3">{media}</div>
          <div className="mt-3">{children}</div>
        </div>
      )
  }
}

/* ---------------- Legend ---------------- */

/** `heading={false}` drops the boxed variant's "Key" label (when a Fold above already titles it). */
export function Legend({ layers, heading = true }: { layers: Layer[]; heading?: boolean }) {
  const v = useDesign().legend
  const prec = (['exact', 'approximate', 'inferred'] as const).map((p) => (
    <span key={p} className="t-caption flex items-center gap-1.5 text-dim"><Marker p={p} size={13} /><span className="sub">{p.slice(0, 6)}</span></span>
  ))
  const cols = layers.map((l) => (
    <span key={l.id} className="t-caption flex items-center gap-1.5 text-dim"><span className="size-2" style={{ background: layerColor(l.color) }} /><span className="sub">{l.label}</span></span>
  ))
  switch (v) {
    case 1: return <div className="flex flex-col gap-1">{prec}<span className="my-1 h-px bg-line" />{cols}</div>
    case 2: return <div className="border border-line p-2">{heading && <div className="sub t-label mb-1.5 text-accent">Key</div>}<div className="grid grid-cols-2 gap-1">{prec}{cols}</div></div>
    case 3: return <div className="flex flex-wrap gap-1.5">{[...prec, ...cols].map((el, i) => <span key={i} className="border border-line px-1.5 py-0.5">{el}</span>)}</div>
    case 4: return <div className="flex flex-wrap gap-x-3 gap-y-1 border border-accent/30 bg-black px-2 py-1.5">{prec}{cols}</div>
    default: return <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{prec}<span className="h-3 w-px bg-line" />{cols}</div>
  }
}

/* ---------------- Toast ---------------- */

export function Toast({ tone = 'err', title, body }: { tone?: Tone; title: string; body?: string }) {
  const v = useDesign().toast
  const c = `var(--color-${tone === 'accent' ? 'accent' : tone})`
  const icon = <span style={{ color: c }}><Icon name={tone === 'err' || tone === 'warn' ? 'alert' : 'live'} /></span>
  const anim = { animation: 'da-fade var(--dur) var(--ease) both' }
  switch (v) {
    case 1: return <div style={{ ...anim, borderColor: c }} className="flex gap-2 border border-l-[3px] border-line bg-panel px-3 py-2">{icon}<div><div className="t-body font-semibold">{title}</div>{body && <div className="t-caption text-dim">{body}</div>}</div></div>
    case 2: return <div style={anim} className="t-caption font-mono"><span style={{ color: c }}>[{tone.toUpperCase()}]</span> {title}{body && <span className="text-dim"> · {body}</span>}</div>
    case 3: return <div style={{ ...anim, background: c }} className="sub t-label flex items-center justify-center gap-2 px-3 py-1.5 text-bg">{title}</div>
    case 4: return <div style={{ ...anim, color: c, borderColor: c, textShadow: `0 0 6px ${c}` }} className="t-caption border bg-black px-2 py-1.5 font-mono tracking-wider uppercase">{title}</div>
    case 5: return <div style={{ ...anim, background: c }} className="chamfer flex gap-2 px-3 py-2 text-bg [--cut:8px]"><Icon name="alert" /><div><div className="t-body font-semibold">{title}</div>{body && <div className="t-caption opacity-80">{body}</div>}</div></div>
    case 6:
      return (
        <div style={{ borderColor: c }} className="overflow-hidden border-y bg-black py-1">
          <div className="sub t-label whitespace-nowrap" style={{ color: c, animation: 'marquee 7s linear infinite' }}>{title} · {body} · {title}</div>
        </div>
      )
    default: return <div style={anim} className="chamfer flex gap-2 bg-line px-3 py-2 [--cut:8px]">{icon}<div><div className="t-body font-semibold">{title}</div>{body && <div className="t-caption text-dim">{body}</div>}</div></div>
  }
}

/* ---------------- Empty / loading / error ---------------- */

function Loader({ v }: { v: number }) {
  switch (v) {
    case 1: return <div className="relative h-14 overflow-hidden border border-line"><span className="absolute inset-x-0 h-px bg-accent-2 shadow-[0_0_8px_var(--color-accent-2)]" style={{ animation: 'scan-y 1.4s linear infinite alternate' }} /></div>
    case 2: return <div className="flex justify-center py-2"><span className="size-7 animate-spin rounded-full border-2 border-line border-t-accent" /></div>
    case 3: return <div className="sub t-label typing text-accent">Acquiring feeds</div>
    case 4: return <div className="flex justify-center py-1"><span className="size-12 rounded-full border border-line" style={{ background: 'conic-gradient(from 0deg, transparent 70%, var(--color-accent-2))', animation: 'spin 1.6s linear infinite' }} /></div>
    case 5: return <div className="noise relative grid h-14 place-items-center bg-black"><span className="sub t-h bg-black/70 px-2 text-dim" style={{ animation: 'glitch-text 1.8s infinite' }}>No signal</span></div>
    case 6: return <div className="flex gap-1">{Array.from({ length: 12 }, (_, i) => <span key={i} className="h-3 flex-1 bg-accent-2" style={{ animation: `breathe 1.2s ${i * 0.08}s ease-in-out infinite` }} />)}</div>
    case 7: return <div className="flex justify-center py-2"><span className="size-4 rounded-full bg-accent" style={{ animation: 'breathe 1.4s ease-in-out infinite' }} /></div>
    default:
      return (
        <div className="flex flex-col gap-1.5">
          {[90, 70, 80].map((w, i) => <span key={i} className="h-3" style={{ width: `${w}%`, background: 'linear-gradient(90deg, var(--color-line) 30%, color-mix(in srgb, var(--color-dim) 40%, var(--color-line)) 50%, var(--color-line) 70%) 0 0 / 200% 100%', animation: 'shimmer 1.4s linear infinite' }} />)}
        </div>
      )
  }
}

export function StateView({ kind, onRetry }: { kind: 'loading' | 'empty' | 'error'; onRetry?: () => void }) {
  const v = useDesign().states
  const mono = v === 3 || v === 5
  if (kind === 'loading') return <Loader v={v} />
  if (kind === 'empty')
    return (
      <div className="flex flex-col items-center gap-1 py-2 text-center">
        <span className="text-[22px] text-dim"><Icon name="globe" /></span>
        <span className={`${mono ? 'font-mono' : 'sub'} t-label text-dim`}>{mono ? '> 0 results in window' : 'No events in this window'}</span>
      </div>
    )
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center">
      <span className={`${mono ? 'font-mono' : 'sub'} t-label text-err`} style={v === 5 ? { animation: 'glitch-text 2s infinite' } : undefined}>{mono ? '[ERR] youtube-api: timeout' : 'Feed unavailable'}</span>
      <Button variant="secondary" onClick={onRetry}>Retry</Button>
    </div>
  )
}

/* ---------------- Boot / refresh loader ---------------- */

const BOOT_LINES = ['ATLAS v0.3 init', 'link globe ........ ok', 'mount layers ...... ok', 'fetch streams ..... 128', 'ready']

export function BootLoader() {
  const v = useDesign().boot
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x + 1) % (BOOT_LINES.length + 3)), 450)
    return () => clearInterval(t)
  }, [])
  const word = <span className="title-weight t-h font-title tracking-(--tracking-title) text-white">ATLAS</span>
  switch (v) {
    case 1: return <div className="flex flex-col items-center gap-2">{word}<div className="relative h-1 w-40 overflow-hidden bg-line"><span className="absolute inset-y-0 w-1/3 bg-accent-2" style={{ animation: 'marquee 1.2s linear infinite reverse' }} /></div></div>
    case 2: return <div className="flex items-center gap-3"><span className="size-10 rounded-full border border-line" style={{ background: 'conic-gradient(from 0deg, transparent 70%, var(--color-accent-2))', animation: 'spin 1.6s linear infinite' }} />{word}</div>
    case 3: return <div className="flex flex-col items-center gap-2">{word}<div className="flex w-40 gap-0.5">{Array.from({ length: 10 }, (_, i) => <span key={i} className={`h-2 flex-1 ${i < (n * 10) / (BOOT_LINES.length + 2) ? 'bg-accent-2' : 'bg-line'}`} />)}</div></div>
    case 4: return <div style={{ animation: 'glitch-text 1.2s infinite' }}>{word}</div>
    case 5: return <div className="flex items-center gap-3"><span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" /><span className="sub t-label text-dim">Loading</span></div>
    default:
      return (
        <div className="t-caption min-h-[6.5em] font-mono leading-snug">
          {BOOT_LINES.slice(0, n).map((l, i) => <div key={i} className={i === BOOT_LINES.length - 1 ? 'text-accent' : 'text-dim'}>&gt; {l}</div>)}
          <span className="caret-b" />
        </div>
      )
  }
}

/* ---------------- Globe HUD ---------------- */

export type HudReadout = { lat: number; lon: number; altKm: number; time: Date }

const fmtLat = (v: number, dp: number) => `${Math.abs(v).toFixed(dp)}° ${v >= 0 ? 'N' : 'S'}`
const fmtLon = (v: number, dp: number) => `${Math.abs(v).toFixed(dp)}° ${v >= 0 ? 'E' : 'W'}`
const fmtTime = (t: Date) => t.toISOString().slice(11, 19)

/** Coordinates, altitude and UTC time over the globe. Pass the live camera readout; defaults are sample values. */
/** `className`/`style` place the boxed readout (variant 7); by default it sits bottom-left of its parent. */
export function GlobeHUD({
  lat = 41.6971,
  lon = 44.8015,
  altKm = 2400,
  time = new Date('2026-10-03T14:32:07Z'),
  className = 'pointer-events-none absolute bottom-3 left-3',
  style,
}: Partial<HudReadout> & { className?: string; style?: CSSProperties }) {
  const pos2 = `${fmtLat(lat, 2)} ${fmtLon(lon, 2)}`
  const pos4 = `${fmtLat(lat, 4)} · ${fmtLon(lon, 4)}`
  const alt = Math.round(altKm).toLocaleString('en-US')
  const utc = fmtTime(time)
  const v = useDesign().hud
  const txt = 't-caption font-mono text-ink/80'
  const zoom = (
    <div className="flex flex-col gap-1">
      {(['plus', 'minus', 'home'] as const).map((i) => <span key={i} className="grid size-6 place-items-center border border-line bg-bg/70 text-dim"><Icon name={i} /></span>)}
    </div>
  )
  switch (v) {
    case 1:
      return <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-line bg-bg/80 px-2 py-1"><span className={txt}>{pos2}</span><span className={txt}>alt {alt} km</span><span className={`${txt} ml-auto text-accent`}>{utc} UTC</span></div>
    case 2:
      return (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="48.5" fill="none" stroke="var(--color-line)" strokeWidth="0.6" />
          {Array.from({ length: 72 }, (_, i) => { const a = (i * 5 * Math.PI) / 180, l = i % 6 === 0 ? 3 : 1.4; return <line key={i} x1={50 + 48.5 * Math.sin(a)} y1={50 - 48.5 * Math.cos(a)} x2={50 + (48.5 - l) * Math.sin(a)} y2={50 - (48.5 - l) * Math.cos(a)} stroke="var(--color-dim)" strokeWidth="0.4" /> })}
          {['N', 'E', 'S', 'W'].map((d, i) => <text key={d} x={50 + 44 * Math.sin((i * Math.PI) / 2)} y={51.5 - 44 * Math.cos((i * Math.PI) / 2)} textAnchor="middle" fontSize="4" fill={d === 'N' ? 'var(--color-accent)' : 'var(--color-dim)'} fontFamily="var(--font-mono)">{d}</text>)}
        </svg>
      )
    case 3: return <div className="pointer-events-auto absolute top-1/2 right-1 -translate-y-1/2">{zoom}</div>
    case 4:
      return (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <svg width="40" height="40" aria-hidden><path d="M20 4V14M20 26V36M4 20H14M26 20H36" stroke="var(--color-accent)" strokeWidth="1" /><circle cx="20" cy="20" r="2" fill="none" stroke="var(--color-accent)" /></svg>
          <span className={`${txt} absolute top-[calc(50%+24px)]`}>{pos2}</span>
        </div>
      )
    case 5:
      return (
        <div className="pointer-events-none absolute inset-1 border border-accent-2/40">
          <span className="absolute -top-px left-3 right-3 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-accent-2)_0_1px,transparent_1px_10px)] opacity-60" />
          <span className={`${txt} absolute top-1.5 left-2 text-accent-2`}>SECTOR 7</span>
          <span className={`${txt} absolute right-2 bottom-1`}>{utc}</span>
        </div>
      )
    case 6:
      return (
        <div className="pointer-events-none absolute inset-y-2 left-0 flex w-14 flex-col gap-1">
          <span className="sub t-label lcars-cap bg-accent px-2 py-1 text-bg">Nav</span>
          <span className="sub t-label flex-1 bg-accent-2/60 px-2 pt-1 text-bg">{fmtLat(lat, 2)}</span>
          <span className="sub t-label bg-line px-2 py-1 text-dim">UTC</span>
        </div>
      )
    case 7:
      return (
        // Chamfered box in the search field's look: same fill (as it sits on the panel), no outline,
        // label in the search field's type
        <div className={`chamfer ${className} bg-[color-mix(in_srgb,var(--color-line)_60%,var(--color-panel))] px-3 py-2 [--cut:8px]`} style={style}>
          <div className="mb-1 font-main text-[13px] text-dim">Position</div>
          <div className={`${txt} leading-relaxed tabular-nums`}>{pos4}</div>
          <div className={`${txt} leading-relaxed tabular-nums`}>ALT {alt} KM</div>
          <div className="t-caption font-mono leading-relaxed text-accent tabular-nums">{utc} UTC</div>
        </div>
      )
    default:
      return (
        <div className="pointer-events-none absolute inset-0">
          <span className={`${txt} absolute top-1 left-1`}>{pos2}</span>
          <span className={`${txt} absolute top-1 right-1 text-accent`}>{utc.slice(0, 5)} UTC</span>
          <span className={`${txt} absolute bottom-1 left-1`}>alt {alt} km</span>
          <span className={`${txt} absolute right-1 bottom-1`}>3 layers</span>
        </div>
      )
  }
}
