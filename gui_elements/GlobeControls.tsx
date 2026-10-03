// The globe control stack (bottom-right of the globe, left of the news dock), including the
// colour scheme switcher.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAtlasControls } from './context'
import { COLOURS } from './catalog'

/* ---------------- Globe control stack ---------------- */

const LINE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const ICONS: Record<string, ReactNode> = {
  plus: <path d="M12 5V19M5 12H19" {...LINE} />,
  minus: <path d="M5 12H19" {...LINE} />,
  ccw: <><path d="M5 9A7.5 7.5 0 1 1 4.6 14.5" {...LINE} /><path d="M4.5 4.5V9.2H9.2" {...LINE} /></>,
  cw: <><path d="M19 9A7.5 7.5 0 1 0 19.4 14.5" {...LINE} /><path d="M19.5 4.5V9.2H14.8" {...LINE} /></>,
  north: <><circle cx="12" cy="12" r="8.5" {...LINE} /><path d="M12 6.5L14.5 12L12 17.5L9.5 12Z" {...LINE} /></>,
  cube: <><path d="M12 3.5L19.5 7.5V16.5L12 20.5L4.5 16.5V7.5Z" {...LINE} /><path d="M4.5 7.5L12 11.5L19.5 7.5M12 11.5V20.5" {...LINE} /></>,
  map: <path d="M4 6.5L9 4.5L15 6.5L20 4.5V17.5L15 19.5L9 17.5L4 19.5ZM9 4.5V17.5M15 6.5V19.5" {...LINE} />,
  play: <path d="M8 5.5L18 12L8 18.5Z" {...LINE} />,
  pause: <path d="M9 6V18M15 6V18" {...LINE} />,
  layers: <path d="M12 4L20 8L12 12L4 8ZM4 12L12 16L20 12M4 16L12 20L20 16" {...LINE} />,
  home: <path d="M4.5 11L12 4.5L19.5 11V19.5H14.5V14.5H9.5V19.5H4.5Z" {...LINE} />,
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
      className={`btn grid h-11 w-full cursor-pointer place-items-center border-t border-accent-2/35 transition-colors duration-150 first:border-t-0 hover:bg-accent-2/10 hover:text-accent ${active ? 'bg-accent-2/15 text-accent' : 'text-ink/80'}`}
    >
      <svg viewBox="0 0 24 24" className="size-[22px]" aria-hidden>{ICONS[icon]}</svg>
    </button>
  )
}

const Group = ({ children }: { children: ReactNode }) => <div className="flex flex-col border border-accent-2/45 bg-bg/80 backdrop-blur-sm">{children}</div>

function ZoomTrack({ zoom, min, max, onZoom }: { zoom: number; min: number; max: number; onZoom: (z: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const t = (zoom - min) / (max - min)
  const set = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    const k = 1 - Math.min(1, Math.max(0, (clientY - r.top - 10) / (r.height - 20)))
    onZoom(Math.round((min + k * (max - min)) * 10) / 10)
  }
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Zoom"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={zoom}
      className="relative h-[150px] cursor-pointer touch-none border-t border-accent-2/35"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e.clientY)
      }}
      onPointerMove={(e) => e.buttons && set(e.clientY)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') onZoom(Math.min(max, Math.round((zoom + 0.1) * 10) / 10))
        if (e.key === 'ArrowDown') onZoom(Math.max(min, Math.round((zoom - 0.1) * 10) / 10))
      }}
    >
      <span className="absolute inset-y-2.5 left-1/2 w-px -translate-x-1/2 bg-accent-2/50" />
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="absolute left-1/2 h-px w-3 -translate-x-1/2 bg-accent-2/40" style={{ top: `calc(10px + ${(i / 6) * 100}% - ${(i / 6) * 20}px)` }} />
      ))}
      <span
        className="absolute left-1/2 h-[5px] w-[26px] -translate-x-1/2 -translate-y-1/2 bg-accent-2 shadow-[0_0_8px_var(--color-accent-2),0_0_2px_#fff] transition-[top] duration-100"
        style={{ top: `calc(10px + ${(1 - t) * 100}% - ${(1 - t) * 20}px)` }}
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
  layersOn: boolean
  onLayers: () => void
  /** Night sky behind the globe (optional: the cell shows only when wired). */
  sky?: boolean
  onSky?: () => void
  onHome: () => void
}

/** The globe control stack: zoom, rotate, north, 3D tilt, satellite map, auto-rotate, layers, night sky, colour scheme, home. */
export function GlobeControls(p: GlobeControlsProps) {
  const { satellite, setSatellite } = useAtlasControls()
  const min = p.minZoom ?? 1
  const max = p.maxZoom ?? 4
  return (
    <div className="flex w-11 flex-col gap-2">
      <Group>
        <Cell icon="plus" label="Zoom in" onClick={() => p.onZoom(Math.min(max, Math.round((p.zoom + 0.2) * 10) / 10))} />
        <ZoomTrack zoom={p.zoom} min={min} max={max} onZoom={p.onZoom} />
        <div className="grid h-9 place-items-center border-t border-accent-2/35 font-mono text-[12px] text-accent-2 tabular-nums">Z{p.zoom.toFixed(1)}</div>
        <Cell icon="minus" label="Zoom out" onClick={() => p.onZoom(Math.max(min, Math.round((p.zoom - 0.2) * 10) / 10))} />
      </Group>
      <Group>
        <Cell icon="ccw" label="Rotate left" onClick={() => p.onRotate(-1)} />
        <Cell icon="cw" label="Rotate right" onClick={() => p.onRotate(1)} />
        <Cell icon="north" label="North up" onClick={p.onNorth} />
        <Cell icon="cube" label="3D tilt" onClick={p.onTilt} active={p.tilt} />
      </Group>
      <Group>
        <Cell icon="map" label={satellite ? 'Wireframe view' : 'Satellite view'} onClick={() => setSatellite(!satellite)} active={satellite} />
        <Cell icon={p.playing ? 'pause' : 'play'} label={p.playing ? 'Stop rotation' : 'Auto-rotate'} onClick={p.onPlay} active={p.playing} />
        <Cell icon="layers" label="Show or hide layers" onClick={p.onLayers} active={p.layersOn} />
        {p.onSky && <Cell icon="saturn" label={p.sky ? 'Hide the night sky' : 'Show the night sky'} onClick={p.onSky} active={p.sky} />}
        <ColourCell />
        <Cell icon="home" label="Reset view" onClick={p.onHome} />
      </Group>
    </div>
  )
}

/* ---------------- Colour scheme cell ---------------- */

/** Control-stack cell that opens the 10 colour schemes to its left. */
function ColourCell() {
  const { colour, setColour } = useAtlasControls()
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
    <div ref={ref} className="relative border-t border-accent-2/35">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Colour scheme: ${COLOURS[colour].name}`}
        title={`Colour scheme: ${COLOURS[colour].name}`}
        className={`btn grid h-11 w-full cursor-pointer place-items-center transition-colors duration-150 hover:bg-accent-2/10 hover:text-accent ${open ? 'bg-accent-2/15 text-accent' : 'text-ink/80'}`}
      >
        <svg viewBox="0 0 24 24" className="size-[22px]" aria-hidden>{ICONS.palette}</svg>
      </button>
      {open && (
        <ul role="listbox" aria-label="Colour scheme" className="absolute right-full bottom-0 z-30 mr-2 w-56 border border-accent-2/45 bg-bg/90 backdrop-blur-sm">
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
