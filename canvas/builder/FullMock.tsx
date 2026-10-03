// Full-screen ATLAS prototype built from one box's design: layout, panels, globe, dock, motion.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useDesign } from '../../gui_elements/context'
import { MOTIONS } from '../../gui_elements/catalog'
import {
  Dock, FeedItem, GlobeHUD, Header, LayerPanel, Legend, MediaFrame, MetaBlock, Toast, type FeedEntry, type Layer,
} from '../../gui_elements/Composites'
import { DEMO_FEED, DEMO_LAYERS, DEMO_META } from './demo'
import { IconButton, Search, Slider } from '../../gui_elements/Controls'
import { MockGlobe, type GlobeApi } from './MockGlobe'
import { GlobeControls } from '../../gui_elements/GlobeControls'
import { Icon } from '../../gui_elements/Icon'
import { LAYOUTS } from '../../gui_elements/layouts'
import { AnimatedList, Collapsible, DockTransition, RollUp } from '../../gui_elements/Motion'
import { Panel } from '../../gui_elements/Panel'
import { Button } from '../../gui_elements/Button'

/** Layouts are drawn for a 1440px-wide screen. Panels keep that pixel width when the window is narrower. */
const REF_W = 1440

type Placed = { style: CSSProperties; left: number; right: number; side: 'left' | 'right' | 'full' | 'center' }

/** Turn a layout rect (percent of a reference screen) into a fixed-width, edge-anchored placement. */
function place(r: { x: number; y: number; w: number; h: number }, w: number): Placed {
  const vert = { top: `${r.y}%`, height: `${r.h}%` }
  const px = (pct: number) => (pct / 100) * REF_W
  if (r.w >= 90) return { side: 'full', left: 0, right: 0, style: { ...vert, left: `${r.x}%`, width: `${r.w}%` } }
  const mid = r.x + r.w / 2
  const width = Math.min(px(r.w), w * 0.42)
  if (Math.abs(mid - 50) < 8) return { side: 'center', left: 0, right: 0, style: { ...vert, left: '50%', width, translate: '-50% 0' } }
  if (mid < 50) {
    const left = px(r.x)
    return { side: 'left', left: left + width, right: 0, style: { ...vert, left, width } }
  }
  const right = px(100 - r.x - r.w)
  return { side: 'right', left: 0, right: right + width, style: { ...vert, right, width } }
}

/** Animates a number towards its target (used to glide the globe when panels roll away). */
function useTween(target: number, ms: number) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const a = from.current
    if (a === target) return
    const t0 = performance.now()
    let id = 0
    const step = (now: number) => {
      const t = ms ? Math.min(1, (now - t0) / ms) : 1
      const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
      from.current = a + (target - a) * e
      setV(from.current)
      if (t < 1) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [target, ms])
  return v
}

const FEED = [...DEMO_FEED, { id: 'd', title: 'Students block ring road for second day', sub: 'Nairobi', p: 'exact' as const, time: '13:58', viewers: '298' }]

export function FullMock() {
  const d = useDesign()
  const L = LAYOUTS[d.layout]
  const ref = useRef<HTMLDivElement>(null)
  const [[w, h], setSize] = useState([1200, 800])
  const [layers, setLayers] = useState<Layer[]>(DEMO_LAYERS)
  // The dock holds the selected entry itself, so it never loses it when the feed rotates
  const [entry, setEntry] = useState<FeedEntry | null>(FEED[0])
  const sel = entry?.id ?? null
  const [panelOpen, setPanelOpen] = useState(true)
  const [hours, setHours] = useState(6)
  const [feed, setFeed] = useState<FeedEntry[]>(FEED.slice(0, 3))
  const [zoom, setZoom] = useState(1)
  const [spin, setSpin] = useState(false)
  const [tilt, setTilt] = useState(false)
  const [showPins, setShowPins] = useState(true)
  // Minimised panels. The control stack moves out to the right edge once the dock is out of the way.
  const [leftMin, setLeftMin] = useState(false)
  const [dockMin, setDockMin] = useState(false)
  const [toolOut, setToolOut] = useState(false)
  const globe = useRef<GlobeApi | null>(null)
  const dur = parseFloat(MOTIONS[d.motion].dur)
  const later = (fn: () => void) => setTimeout(fn, dur)

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize([e.contentRect.width, e.contentRect.height]))
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    let n = 0
    const t = setInterval(() => {
      n++
      const src = FEED[n % FEED.length]
      setFeed((xs) => [{ ...src, id: `${src.id}-${n}` }, ...xs].slice(0, 4))
    }, 6000)
    return () => clearInterval(t)
  }, [])

  const g = d.zorder === 1 ? L.docked : L.float
  const placed = L.panels.map((r) => place(r, w))
  // Free horizontal space between left- and right-anchored panels; minimised panels give theirs back
  const baseL = Math.max(0, ...placed.filter((p) => p.side === 'left').map((p) => p.left))
  const baseR = w - Math.max(0, ...placed.filter((p) => p.side === 'right').map((p) => p.right))
  const freeL = leftMin ? 0 : baseL
  const freeR = toolOut ? w : baseR
  // Sized like a real window: the globe fits the free space, panels keep their pixel scale
  const docked = d.zorder === 1
  const globeSize = useTween(Math.round(Math.min((g.r / 100) * 2 * h, (docked ? freeR - freeL : w) * 0.9) + 20), dur)
  const globeX = useTween(docked ? (freeL + freeR) / 2 : (g.cx / 100) * w, dur)
  const canvasSize = Math.round(Math.max(freeR - freeL, h, globeSize))

  // Dock: minimise rolls it up, then the control stack glides right; restore reverses the order
  const minimiseDock = () => {
    setDockMin(true)
    later(() => setToolOut(true))
  }
  const restoreDock = (then?: () => void) => {
    setToolOut(false)
    later(() => {
      setDockMin(false)
      then?.()
    })
  }
  const closeDock = () => {
    setEntry(null)
    later(() => setToolOut(true))
  }
  const open = (e: FeedEntry) => {
    if (entry && !dockMin) return setEntry(e)
    if (dockMin) return restoreDock(() => setEntry(e))
    setToolOut(false)
    later(() => setEntry(e))
  }
  const panelStyle: CSSProperties | undefined =
    d.zorder === 2 ? ({ '--panel-fill': 'color-mix(in srgb, var(--color-panel) 60%, transparent)', '--panel-blur': 'blur(10px)' } as CSSProperties) : undefined
  const hide = d.zorder === 3 ? 'opacity-25 hover:opacity-100 transition-opacity duration-(--dur)' : ''

  const layersBlock = (
    <>
      <div data-roll-keep>
        <div className="flex items-start justify-between gap-2">
          <Header />
          {d.panelOpen === 7 ? (
            <IconButton icon={leftMin ? 'expand' : 'collapse'} onClick={() => setLeftMin(!leftMin)} />
          ) : (
            <IconButton icon="collapse" onClick={() => setPanelOpen(false)} />
          )}
        </div>
        <div className="mt-3"><Search /></div>
      </div>
      <div className="mt-3"><LayerPanel layers={layers} onToggle={(id, on) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, on } : l)))} /></div>
    </>
  )
  const feedBlock = (
    <>
      <div className="mt-3 flex items-baseline justify-between"><span className="sub t-label text-accent">Feed</span><span className="t-caption font-mono text-dim">last {hours}h</span></div>
      <div className="mt-1.5"><Slider value={hours} onChange={setHours} /></div>
      <div className="mt-2"><AnimatedList items={feed} render={(e) => <FeedItem entry={e} selected={sel === e.id} onClick={() => open(e)} />} /></div>
    </>
  )
  const dockBlock = (
    <DockTransition show={!!entry}>
      {entry && (
        <RollUp minimized={dockMin}>
        <Panel className="h-full" style={panelStyle}>
          <div className="h-full overflow-y-auto pr-1">
            <Dock title={entry.title} media={<MediaFrame />} onClose={closeDock} minimized={dockMin} onMinimize={() => (dockMin ? restoreDock() : minimiseDock())}>
              <MetaBlock items={DEMO_META} />
              <div className="mt-3 flex gap-2"><Button>Watch live</Button><Button variant="secondary">Share</Button></div>
            </Dock>
          </div>
        </Panel>
        </RollUp>
      )}
    </DockTransition>
  )

  const content = (k: string, i: number): ReactNode => {
    if (k === 'panel') {
      const panel = <Panel className="h-full" style={panelStyle}><div className="h-full overflow-y-auto pr-1">{layersBlock}{feedBlock}</div></Panel>
      return d.panelOpen === 7 ? (
        <RollUp minimized={leftMin} className="h-full">{panel}</RollUp>
      ) : (
        <Collapsible open={panelOpen} onOpen={() => setPanelOpen(true)}>{panel}</Collapsible>
      )
    }
    if (k === 'dock') return dockBlock
    if (k === 'bar')
      return i === 0 ? (
        <Panel className="h-full" style={panelStyle}><div className="flex h-full items-center gap-4"><Header /><div className="w-64"><Search /></div><div className="ml-auto"><Legend layers={layers} /></div></div></Panel>
      ) : (
        <Panel className="h-full" style={panelStyle}><div className="t-caption flex h-full items-center gap-4 font-mono text-dim"><span>41.69°N 44.80°E</span><span className="text-accent">14:32:07 UTC</span><span className="ml-auto">12 / 12 sources</span></div></Panel>
      )
    if (k === 'card') {
      const cards = [layersBlock, feedBlock, null, <Legend key="l" layers={layers} />]
      if (i === 2) return dockBlock
      return <Panel className="h-full" style={panelStyle}><div className="h-full overflow-y-auto pr-1">{cards[i]}</div></Panel>
    }
    if (k === 'rail')
      return <div className="flex h-full flex-col items-center gap-3 border-r border-line bg-panel pt-3 text-[16px] text-dim">{(['layers', 'search', 'filter', 'settings'] as const).map((n) => <Icon key={n} name={n} />)}</div>
    return <button type="button" onClick={() => (entry ? closeDock() : open(FEED[0]))} className="sub h-full w-full cursor-pointer border border-line bg-panel text-[9px] text-accent [writing-mode:vertical-rl]">Detail</button>
  }

  return (
    <div ref={ref} className="stage relative h-full w-full overflow-hidden">
      <div className="absolute" style={{ left: globeX, top: `${g.cy}%`, translate: '-50% -50%' }}>
        {/* Drawn on a canvas covering the whole free area, so zooming in fills the view instead of a box */}
        <MockGlobe
          size={canvasSize}
          zoom={(zoom * globeSize) / canvasSize}
          spin={spin}
          tilt={tilt}
          showPins={showPins}
          api={globe}
          onSelect={(pin) => {
            const hit = FEED.find((e) => e.sub === pin.name)
            if (hit) open(hit)
          }}
        />
      </div>
      {/* HUD and controls live in the free area between the panels */}
      <div className="pointer-events-none absolute inset-y-0" style={{ left: freeL, right: w - freeR, transition: 'left var(--dur) var(--ease), right var(--dur) var(--ease)' }}>
        <GlobeHUD />
        <div className="pointer-events-auto absolute right-3 bottom-3">
          <GlobeControls
            zoom={zoom}
            onZoom={setZoom}
            onRotate={(dir) => globe.current?.rotateBy(dir * 30)}
            onNorth={() => globe.current?.north()}
            tilt={tilt}
            onTilt={() => setTilt(!tilt)}
            playing={spin}
            onPlay={() => setSpin(!spin)}
            layersOn={showPins}
            onLayers={() => setShowPins(!showPins)}
            onHome={() => {
              setZoom(1)
              setTilt(false)
              setSpin(false)
              globe.current?.home()
            }}
          />
        </div>
      </div>
      {L.panels.map((r, i) => {
        const nth = L.panels.slice(0, i).filter((p) => p.k === r.k).length
        return (
          <div key={i} className={`absolute ${hide}`} style={placed[i].style}>
            {content(r.k, nth)}
          </div>
        )
      })}
      <div className="absolute top-4 -translate-x-1/2" style={{ left: (baseL + baseR) / 2, width: Math.max(180, Math.min(320, baseR - baseL - 24)) }}><Toast tone="live" title="New stream: Tbilisi" body="1.2k watching · exact" /></div>
    </div>
  )
}
