// One live sample per design category, rendered inside the box's <ArgusTheme>.
import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '../../gui_elements/Badge'
import { Button } from '../../gui_elements/Button'
import { COLOURS, LAYER_PALETTES, type Category } from '../../gui_elements/catalog'
import {
  AnimatedList, Collapsible, DockTransition, MovablePanel,
} from '../../gui_elements/Motion'
import {
  BootLoader, Dock, FeedItem, GlobeHUD, Header, LayerPanel, LayerRow, Legend, MediaFrame, MetaBlock, StateView, Toast,
  type FeedEntry, type Layer,
} from '../../gui_elements/Composites'
import { DEMO_FEED, DEMO_LAYERS, DEMO_META } from './demo'
import { Check, IconButton, IconSet, Marker, Search, Select, Slider, Tooltip } from '../../gui_elements/Controls'
import { useDesign } from '../../gui_elements/context'
import { MockGlobe } from './MockGlobe'
import { Icon } from '../../gui_elements/Icon'
import { ICON_LIST } from '../../gui_elements/icons'
import { PhonePreview, ScreenPreview } from './Previews'
import { Panel } from '../../gui_elements/Panel'
import { Toggle } from '../../gui_elements/Toggle'

function useLayers() {
  const [layers, setLayers] = useState<Layer[]>(DEMO_LAYERS)
  return [layers, (id: string, on: boolean) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, on } : l)))] as const
}

/** Re-runs children periodically so one-shot animations keep showing. */
function Replay({ every = 3000, children }: { every?: number; children: (k: number) => ReactNode }) {
  const [k, setK] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setK((x) => x + 1), every)
    return () => clearInterval(t)
  }, [every])
  return <>{children(k)}</>
}

const Stage = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`stage p-2.5 ${className}`}>{children}</div>
const small = 'text-[10px] text-dim'

function MotionDemo() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setOn((x) => !x), 1400)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="relative h-7 border border-line">
      <span className="absolute top-1 h-5 w-10 bg-accent transition-[left] duration-(--dur) ease-(--ease)" style={{ left: on ? 'calc(100% - 44px)' : '4px' }} />
    </div>
  )
}

function ListDemo() {
  const [items, setItems] = useState<(FeedEntry & { id: string })[]>(DEMO_FEED.slice(0, 2))
  useEffect(() => {
    let n = 0
    const t = setInterval(() => {
      n++
      const src = DEMO_FEED[n % DEMO_FEED.length]
      setItems((xs) => [{ ...src, id: `${src.id}-${n}` }, ...xs].slice(0, 3))
    }, 2200)
    return () => clearInterval(t)
  }, [])
  return <AnimatedList items={items} render={(e) => <FeedItem entry={e} />} />
}

function FeedDemo() {
  const [sel, setSel] = useState('a')
  return <div className="flex flex-col">{DEMO_FEED.map((e) => <FeedItem key={e.id} entry={e} selected={sel === e.id} onClick={() => setSel(e.id)} />)}</div>
}

function MediaDemo() {
  const [state, setState] = useState<'live' | 'loading' | 'offline'>('live')
  return (
    <div>
      <MediaFrame state={state} />
      <div className="mt-1.5 flex gap-2">
        {(['live', 'loading', 'offline'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setState(s)} className={`sub cursor-pointer text-[9px] ${s === state ? 'text-accent' : 'text-dim'}`}>{s}</button>
        ))}
      </div>
    </div>
  )
}

function OpenDemo() {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex items-start gap-3">
      <div className="w-44">
        <Collapsible open={open} onOpen={() => setOpen(true)}>
          <Panel><div className="sub text-[10px] text-accent">Layers</div><div className="mt-1 text-xs">Live streams · 128</div></Panel>
        </Collapsible>
      </div>
      <Button variant="secondary" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Open'}</Button>
    </div>
  )
}

function DockDemo() {
  const [show, setShow] = useState(true)
  return (
    <div className="flex items-start gap-3">
      <div className="h-[86px] w-44 overflow-hidden">
        <DockTransition show={show}>
          <Panel><div className="sub text-[10px] text-accent">Live stream</div><div className="mt-1 text-xs leading-snug">Crowds swell in Tbilisi</div></Panel>
        </DockTransition>
      </div>
      <Button variant="secondary" onClick={() => setShow(!show)}>{show ? 'Clear' : 'Select'}</Button>
    </div>
  )
}

function Swatches({ colors, names }: { colors: string[]; names?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {colors.map((c, i) => (
        <span key={i} className="flex flex-col items-center gap-0.5">
          <span className="size-6 border border-white/10" style={{ background: c }} title={c} />
          {names && <span className="text-[8px] text-dim">{names[i]}</span>}
        </span>
      ))}
    </div>
  )
}

function Sample({ cat }: { cat: Category }) {
  const d = useDesign()
  const [layers, toggle] = useLayers()
  const [on, setOn] = useState(true)
  const [checks, setChecks] = useState([true, false])
  const [hours, setHours] = useState(6)

  switch (cat) {
    case 'title':
      return <div className="title-weight g-text font-title text-[26px] tracking-(--tracking-title) whitespace-nowrap text-white">ARGUS</div>
    case 'main':
      return <div className="text-[13.5px] leading-snug"><b className="font-semibold">Live streams</b> · Protesters gather outside parliament as police form lines</div>
    case 'sub':
      return <div className="flex flex-col gap-0.5"><span className="sub text-[11px] text-accent">Layers · Sector 7</span><span className="sub text-[11px] text-dim">1.2k watching · 4m · Tbilisi</span></div>
    case 'news':
      return <div><div className="font-news text-[17px] leading-snug font-semibold text-white">Crowds swell in Tbilisi as talks stall</div><p className="mt-1 font-news text-[13px] leading-relaxed text-ink/80">Tens of thousands filled Rustaveli Avenue for a fourth night.</p></div>
    case 'mono':
      return <div className="font-mono text-[12px] leading-relaxed text-dim tabular-nums">41.6971° N · 44.8015° E<br /><span className="text-accent">14:32:07 UTC</span> · yt:7f3a91 · 0O1lI</div>
    case 'type':
      return (
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="title-weight t-title font-title tracking-(--tracking-title) text-white">ARGUS</span>
          <span className="t-h font-semibold">Crowds swell in Tbilisi</span>
          <span className="t-body">Body text for descriptions and lists.</span>
          <span className="sub t-label text-accent">Section label</span>
          <span className="t-caption text-dim">Caption · 4m ago</span>
        </div>
      )
    case 'colour': {
      const c = COLOURS[d.colour]
      return <Swatches colors={[c.bg, c.panel, c.line, c.ink, c.dim, c.accent, c.accent2]} names={['bg', 'panel', 'line', 'ink', 'dim', 'acc', 'acc2']} />
    }
    case 'semantic':
      return <div className="flex flex-wrap gap-2"><Badge tone="ok">OK 12</Badge><Badge tone="warn">Slow</Badge><Badge tone="err">Error</Badge><Badge tone="live">Live</Badge></div>
    case 'layers':
      return <Swatches colors={LAYER_PALETTES[d.layers].colors} names={['L1', 'L2', 'L3', 'L4', 'L5', 'L6']} />
    case 'spacing':
      return <Panel><div className="sub t-label text-accent">Layers</div>{layers.slice(0, 2).map((l) => <LayerRow key={l.id} layer={l} onToggle={(o) => toggle(l.id, o)} />)}</Panel>
    case 'frame':
      return <Stage><Panel><div className="sub text-[10px] text-accent">Layers</div><div className="mt-1 text-xs">Live streams · 128 active</div></Panel></Stage>
    case 'surface':
      return <Stage><Panel><div className="sub text-[10px] text-accent">Detail</div><div className="mt-1 text-xs">Frosted glass needs Glow off to blur.</div></Panel></Stage>
    case 'glow':
      return (
        <Stage className="flex items-center gap-4">
          <span className="title-weight g-text font-title text-base tracking-(--tracking-title) text-white">ARGUS</span>
          <span className="g-el"><Button>Live</Button></span>
          <Toggle checked={on} onChange={setOn} label="Sample" />
        </Stage>
      )
    case 'iconStyle':
      return <div className="flex flex-wrap gap-2.5 text-[17px] text-ink">{ICON_LIST.slice(0, 10).map((n) => <Icon key={n} name={n} />)}</div>
    case 'motion':
      return <MotionDemo />
    case 'button':
      return <div className="flex flex-wrap items-center gap-2"><Button>Watch</Button><Button variant="secondary">Share</Button><Button variant="danger">Delete</Button><Button loading>Load</Button></div>
    case 'toggle':
      return <div className="flex items-center gap-4"><Toggle checked={on} onChange={setOn} label="Sample" /><Toggle checked={!on} onChange={(v) => setOn(!v)} label="Sample 2" /><span className={small}>click</span></div>
    case 'check':
      return (
        <div className="flex flex-wrap items-center gap-3">
          {['Exact', 'Inferred'].map((l, k) => <Check key={l} checked={checks[k]} onChange={() => setChecks(checks.map((c, j) => (j === k ? !c : c)))} label={l} />)}
          {[1, 6].map((h) => <Check key={h} radio checked={hours === h} onChange={() => setHours(h)} label={`${h}h`} />)}
        </div>
      )
    case 'icons':
      return <IconSet />
    case 'badge':
      return <div className="flex flex-wrap gap-2"><Badge tone="live">Live</Badge><Badge>128</Badge><Badge tone="ok">OK 12</Badge><Badge tone="err">Err</Badge></div>
    case 'marker':
      return <Stage className="flex gap-5">{(['exact', 'approximate', 'inferred'] as const).map((p) => <span key={p} className="flex items-center gap-1.5"><Marker p={p} /><span className="sub text-[9px] text-dim">{p.slice(0, 6)}</span></span>)}</Stage>
    case 'search':
      return <div className="flex flex-col gap-2"><Search placeholder="Search…" /><Select label="Region" defaultValue="all"><option value="all">All regions</option><option>Caucasus</option><option>Balkans</option></Select></div>
    case 'slider':
      return <div className="flex items-center gap-4"><div className="flex-1"><Slider value={hours} onChange={setHours} /></div><span className="w-8 font-mono text-[11px] text-dim">{hours}h</span></div>
    case 'tooltip':
      return <Stage className="relative h-[82px]"><span className="absolute top-[64px] left-1/3 -translate-x-1/2 -translate-y-1/2"><Marker p="exact" size={16} /><Tooltip title="Tbilisi" sub="1.2k watching" /></span></Stage>
    case 'scrollbar':
      return <div className="h-20 overflow-y-scroll border border-line p-1.5 text-[11px] text-dim">{Array.from({ length: 12 }, (_, i) => <div key={i}>Stream {i + 1} · Tbilisi · {i + 2}m ago</div>)}</div>
    case 'focus':
      return <div className="flex items-center gap-4 p-1"><Button className="demo-focus">Focused</Button><Toggle checked={on} onChange={setOn} label="Focused toggle" className="demo-focus" /><span className={small}>Tab to try</span></div>
    case 'layout':
    case 'zorder':
      return <ScreenPreview />
    case 'header':
      return <Header />
    case 'responsive':
      return <div className="flex items-center gap-3"><PhonePreview /><span className={small}>Mobile fallback</span></div>
    case 'layerPanel':
      return <LayerPanel layers={layers} onToggle={toggle} />
    case 'layerRow':
      return <div>{layers.slice(0, 2).map((l) => <LayerRow key={l.id} layer={l} onToggle={(o) => toggle(l.id, o)} />)}</div>
    case 'feed':
      return <FeedDemo />
    case 'dock':
      return <Panel><Dock title="Crowds swell in Tbilisi as talks stall" media={<MediaFrame />}><MetaBlock items={DEMO_META.slice(0, 2)} /></Dock></Panel>
    case 'media':
      return <MediaDemo />
    case 'meta':
      return <MetaBlock items={DEMO_META.slice(0, 4)} />
    case 'legend':
      return <Legend layers={DEMO_LAYERS} />
    case 'toast':
      return <Replay every={3500}>{(k) => <div key={k} className="flex flex-col gap-2"><Toast tone="err" title="youtube-api timed out" body="Retrying in 30s" /><Toast tone="live" title="New stream: Tbilisi" body="1.2k watching" /></div>}</Replay>
    case 'states':
      return <div className="grid grid-cols-2 gap-2"><StateView kind="loading" /><StateView kind="error" /></div>
    case 'hud':
      return <div className="flex justify-center"><MockGlobe size={190} flashes={false}><GlobeHUD /></MockGlobe></div>
    case 'globe':
    case 'pin':
    case 'cluster':
    case 'selected':
      return <div className="flex justify-center"><MockGlobe size={200} flashes={false} /></div>
    case 'flash':
      return <div className="flex justify-center"><MockGlobe size={200} /></div>
    case 'flyto':
      return <div className="flex justify-center"><MockGlobe size={200} autoplay flashes={false} /></div>
    case 'panelMove':
      return (
        <Stage className="relative h-32 !p-0">
          <MovablePanel><Panel className="w-32"><div className="sub text-[10px] text-accent">Drag me</div><div className="mt-1 text-[11px] text-dim">Layers</div></Panel></MovablePanel>
        </Stage>
      )
    case 'panelOpen':
      return <OpenDemo />
    case 'dockAnim':
      return <DockDemo />
    case 'listAnim':
      return <ListDemo />
    case 'micro':
      return <div className="flex items-center gap-3"><Button>Press</Button><Toggle checked={on} onChange={setOn} label="Sample" /><IconButton icon="close" /><span className={small}>press &amp; hold</span></div>
    case 'boot':
      return <BootLoader />
    case 'reduced':
      return <div className="flex items-center gap-3"><StateView kind="loading" /><span className={small}>Reduce stops loops and slides.</span></div>
  }
}

export { Sample }
