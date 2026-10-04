// The globe control strip (flat along the bottom of the screen, centred), including the colour
// scheme switcher.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useArgusControls } from './context'
import { COLOURS } from './catalog'

/* ---------------- Globe control strip ---------------- */

const LINE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const ICONS: Record<string, ReactNode> = {
  plus: <path d="M12 5V19M5 12H19" {...LINE} />,
  minus: <path d="M5 12H19" {...LINE} />,
  ccw: <><path d="M5 9A7.5 7.5 0 1 1 4.6 14.5" {...LINE} /><path d="M4.5 4.5V9.2H9.2" {...LINE} /></>,
  cw: <><path d="M19 9A7.5 7.5 0 1 0 19.4 14.5" {...LINE} /><path d="M19.5 4.5V9.2H14.8" {...LINE} /></>,
  north: <><circle cx="12" cy="12" r="8.5" {...LINE} /><path d="M12 6.5L14.5 12L12 17.5L9.5 12Z" {...LINE} /></>,
  cube: <><path d="M12 3.5L19.5 7.5V16.5L12 20.5L4.5 16.5V7.5Z" {...LINE} /><path d="M4.5 7.5L12 11.5L19.5 7.5M12 11.5V20.5" {...LINE} /></>,
  play: <path d="M8 5.5L18 12L8 18.5Z" {...LINE} />,
  pause: <path d="M9 6V18M15 6V18" {...LINE} />,
  layers: <path d="M12 4L20 8L12 12L4 8ZM4 12L12 16L20 12M4 16L12 20L20 16" {...LINE} />,
  home: <path d="M4.5 11L12 4.5L19.5 11V19.5H14.5V14.5H9.5V19.5H4.5Z" {...LINE} />,
  place: (
    <>
      <path d="M12 21C12 21 5.5 14.6 5.5 9.8A6.5 6.5 0 0 1 18.5 9.8C18.5 14.6 12 21 12 21Z" {...LINE} />
      <circle cx="12" cy="9.8" r="2.4" {...LINE} />
    </>
  ),
  saturn: (
    <>
      <circle cx="12" cy="12" r="4.6" {...LINE} />
      <g transform="rotate(-22 12 12)">
        {/* Back of the ring stops at the planet's edge; the front crosses it */}
        <path d="M1.8 12A10.2 3.2 0 0 1 7.3 9.2M16.7 9.2A10.2 3.2 0 0 1 22.2 12" {...LINE} />
        <path d="M1.8 12A10.2 3.2 0 0 0 22.2 12" {...LINE} />
      </g>
    </>
  ),
  palette: <><path d="M12 4A8 8 0 1 0 12 20C13.4 20 13.6 18.9 12.9 18.1C12.2 17.3 12.5 16 13.8 16H16A4 4 0 0 0 20 12C20 7.6 16.4 4 12 4Z" {...LINE} /><circle cx="8" cy="11" r="1.1" fill="currentColor" /><circle cx="11" cy="7.8" r="1.1" fill="currentColor" /><circle cx="15" cy="8.5" r="1.1" fill="currentColor" /></>,
}

function Cell({ icon, label, onClick, active = false }: { icon: string; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`btn grid size-10 flex-none cursor-pointer place-items-center border-l border-accent-2/35 transition-colors duration-150 first:border-l-0 hover:bg-accent-2/10 hover:text-accent ${active ? 'bg-accent-2/15 text-accent' : 'text-ink/80'}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>{ICONS[icon]}</svg>
    </button>
  )
}

const Group = ({ children }: { children: ReactNode }) => <div className="flex flex-none border border-accent-2/45 bg-bg/80 backdrop-blur-sm">{children}</div>

function ZoomTrack({ zoom, min, max, onZoom }: { zoom: number; min: number; max: number; onZoom: (z: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const t = (zoom - min) / (max - min)
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const k = Math.min(1, Math.max(0, (clientX - r.left - 10) / (r.width - 20)))
    onZoom(Math.round((min + k * (max - min)) * 10) / 10)
  }
  const step = (max - min) / 50
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Zoom"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={zoom}
      className="relative h-10 w-[130px] flex-none cursor-pointer touch-none border-l border-accent-2/35"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e.clientX)
      }}
      onPointerMove={(e) => e.buttons && set(e.clientX)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onZoom(Math.min(max, zoom + step))
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onZoom(Math.max(min, zoom - step))
      }}
    >
      <span className="absolute inset-x-2.5 top-1/2 h-px -translate-y-1/2 bg-accent-2/50" />
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-accent-2/40" style={{ left: `calc(10px + ${(i / 6) * 100}% - ${(i / 6) * 20}px)` }} />
      ))}
      <span
        className="absolute top-1/2 h-[24px] w-[5px] -translate-x-1/2 -translate-y-1/2 bg-accent-2 shadow-[0_0_8px_var(--color-accent-2),0_0_2px_#fff] transition-[left] duration-100"
        style={{ left: `calc(10px + ${t * 100}% - ${t * 20}px)` }}
      />
    </div>
  )
}

export type GlobeControlsProps = {
  zoom: number
  onZoom: (z: number) => void
  minZoom?: number
  maxZoom?: number
  onRotate: (dir: -1 | 1) => void
  onNorth: () => void
  tilt: boolean
  onTilt: () => void
  playing: boolean
  onPlay: () => void
  /** Country and city names (optional: the cell shows only when wired). */
  places?: boolean
  onPlaces?: () => void
  /** Night sky behind the globe (optional: the cell shows only when wired). */
  sky?: boolean
  onSky?: () => void
  onHome: () => void
}

/** The globe control stack: zoom, rotate, north, 3D tilt, base map (wireframe/satellite), auto-rotate, place names, night sky, colour scheme, home. */
export function GlobeControls(p: GlobeControlsProps) {
  const { satellite, setSatellite } = useArgusControls()
  const min = p.minZoom ?? 0
  const max = p.maxZoom ?? 100
  const step = (max - min) / 10
  const pct = Math.round(((p.zoom - min) / (max - min)) * 100)
  return (
    <div className="flex items-center gap-2">
      <Group>
        <Cell icon="minus" label="Zoom out" onClick={() => p.onZoom(Math.max(min, p.zoom - step))} />
        <ZoomTrack zoom={p.zoom} min={min} max={max} onZoom={p.onZoom} />
        <div className="grid h-10 w-12 flex-none place-items-center border-l border-accent-2/35 font-mono text-[12px] text-accent-2 tabular-nums" title="Zoom: 0% is the whole globe">
          {pct}%
        </div>
        <Cell icon="plus" label="Zoom in" onClick={() => p.onZoom(Math.min(max, p.zoom + step))} />
      </Group>
      <Group>
        <Cell icon="ccw" label="Rotate left" onClick={() => p.onRotate(-1)} />
        <Cell icon="cw" label="Rotate right" onClick={() => p.onRotate(1)} />
        <Cell icon="north" label="North up" onClick={p.onNorth} />
        <Cell icon="cube" label="3D tilt" onClick={p.onTilt} active={p.tilt} />
      </Group>
      <Group>
        <Cell icon={p.playing ? 'pause' : 'play'} label={p.playing ? 'Stop rotation (Space)' : 'Auto-rotate (Space)'} onClick={p.onPlay} active={p.playing} />
        {/* Base map: wireframe or satellite imagery */}
        <Cell icon="layers" label={satellite ? 'Wireframe view' : 'Satellite view'} onClick={() => setSatellite(!satellite)} active={satellite} />
        {p.onPlaces && <Cell icon="place" label={p.places ? 'Hide place names' : 'Show place names'} onClick={p.onPlaces} active={p.places} />}
        {p.onSky && <Cell icon="saturn" label={p.sky ? 'Hide the night sky' : 'Show the night sky'} onClick={p.onSky} active={p.sky} />}
        <ColourCell />
        <Cell icon="home" label="Reset view" onClick={p.onHome} />
      </Group>
    </div>
  )
}

/* ---------------- Colour scheme cell ---------------- */

/** Control-strip cell that opens the 10 colour schemes above it. */
function ColourCell() {
  const { colour, setColour } = useArgusControls()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={ref} className="relative border-l border-accent-2/35">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Colour scheme: ${COLOURS[colour].name}`}
        title={`Colour scheme: ${COLOURS[colour].name}`}
        className={`btn grid size-10 cursor-pointer place-items-center transition-colors duration-150 hover:bg-accent-2/10 hover:text-accent ${open ? 'bg-accent-2/15 text-accent' : 'text-ink/80'}`}
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>{ICONS.palette}</svg>
      </button>
      {open && (
        <ul role="listbox" aria-label="Colour scheme" className="absolute right-0 bottom-full z-30 mb-2 w-56 border border-accent-2/45 bg-bg/90 backdrop-blur-sm">
          {COLOURS.map((col, i) => (
            <li key={col.name} className="border-t border-accent-2/20 first:border-t-0">
              <button
                type="button"
                role="option"
                aria-selected={i === colour}
                onClick={() => {
                  setColour(i)
                  setOpen(false)
                }}
                className={`flex h-9 w-full cursor-pointer items-center gap-2.5 px-2.5 text-left transition-colors hover:bg-accent-2/10 ${i === colour ? 'bg-accent-2/15 text-accent' : 'text-ink/80'}`}
              >
                <span className="flex flex-none">
                  {[col.bg, col.accent, col.accent2].map((h, k) => <span key={k} className="size-3 border border-white/15" style={{ background: h }} />)}
                </span>
                <span className="sub t-caption truncate">{col.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
