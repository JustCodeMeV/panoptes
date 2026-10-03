import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../gui_elements/Button'
import logo from '../assets/ATLAS_LOGO.png'
import { featuresOf, useStore } from '../core/store'
import { useLayerData } from '../core/useLayerData'
import { LAYERS } from '../layers'
import { openApp } from '../route'
import { IssFrame } from './IssFrame'
import { useGeoIp } from './useGeoIp'

// Cesium loads after the page so the hero text is there at once
const LandingGlobe = lazy(() => import('./LandingGlobe'))

const NAV = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'What is ATLAS' },
  { id: 'layers', label: 'Layers' },
  { id: 'sources', label: 'Sources' },
  { id: 'tech', label: 'Technology' },
]

const SOURCES: { group: string; items: string[] }[] = [
  { group: 'News & narrative', items: ['22 global news wires', 'GDELT', 'Telegram channels', 'Google Trends', 'Fact-check feeds', 'Wikipedia conflict events'] },
  { group: 'Prediction markets', items: ['Polymarket', 'Kalshi', 'Manifold'] },
  { group: 'Physical signals', items: ['IODA blackouts', 'Cloudflare Radar', 'OONI censorship', 'GDACS disasters', 'USGS earthquakes', 'NASA EONET & FIRMS'] },
  { group: 'Air, sea & space', items: ['adsb.lol military aircraft', 'GPSJam', 'AISStream ships', 'CelesTrak satellites'] },
  { group: 'Conflict & infrastructure', items: ['ACLED', 'DeepState frontline', 'TeleGeography cables'] },
]

const STEPS = [
  { k: '01', title: 'Collect', text: 'Dozens of providers poll in parallel. Each is fault-isolated: one dead feed never takes a layer down, and its status shows live in the panel.' },
  { k: '02', title: 'Normalise', text: 'Everything becomes one Feature: what, where, when, and the provenance behind it. Duplicates from different sources merge into one story.' },
  { k: '03', title: 'Stream', text: 'Changes are pushed to the browser as they happen over server-sent events, and land on a CesiumJS globe in real time.' },
]

const PRECISION = [
  { label: 'Exact', text: 'Platform-reported coordinates', mark: 'bg-accent-2' },
  { label: 'Approximate', text: 'Broadcaster base or a coarsened location', mark: 'border-2 border-accent-2 bg-accent-2/40' },
  { label: 'Inferred', text: 'Guessed from the text, and labelled as such', mark: 'border border-dashed border-accent-2 bg-accent-2/15' },
]

/** Fades a block up into place the first time it scrolls into view. */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,translate] duration-700 ease-out ${shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}
    >
      {children}
    </div>
  )
}

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-8">
      <Reveal>
        <p className="sub t-label text-accent-2">{kicker}</p>
        <h2 className="title-weight mt-2 font-title text-[clamp(26px,4vw,40px)] tracking-(--tracking-title) text-white">{title}</h2>
      </Reveal>
      <div className="mt-10">{children}</div>
    </section>
  )
}

/** Live numbers from the running engine. */
function useStats() {
  const layers = useStore((s) => s.layers)
  const features = Object.values(layers).reduce((n, st) => n + featuresOf(st).length, 0)
  const [sources, setSources] = useState<number | null>(null)
  useEffect(() => {
    fetch('/api/layers')
      .then((r) => r.json())
      .then((d: { providers: { enabled: boolean }[] }[]) => setSources(d.reduce((n, l) => n + l.providers.filter((p) => p.enabled).length, 0)))
      .catch(() => {})
  }, [])
  return { features, sources }
}

/** The public face of ATLAS, behind the logo: a live view from orbit, then what ATLAS is and how it works. */
export default function Landing() {
  useLayerData()
  const spot = useGeoIp()
  const stats = useStats()
  const hero = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [heroOnScreen, setHeroOnScreen] = useState(true)
  const [globeReady, setGlobeReady] = useState(false)
  const onGlobeReady = useCallback(() => setGlobeReady(true), [])
  // Never leave the hero dark if imagery is slow or blocked
  useEffect(() => {
    const t = setTimeout(onGlobeReady, 8000)
    return () => clearTimeout(t)
  }, [onGlobeReady])

  // Pause the globe's drift once the hero has scrolled away
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setHeroOnScreen(e.isIntersecting))
    if (hero.current) io.observe(hero.current)
    return () => io.disconnect()
  }, [])

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="h-full overflow-y-auto bg-bg font-main text-ink" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 40)}>
      {/* Top bar */}
      <header className={`fixed inset-x-0 top-0 z-20 transition-colors duration-300 ${scrolled ? 'border-b border-line bg-bg/80 backdrop-blur-md' : 'bg-transparent'}`}>
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-8">
          <button type="button" onClick={() => go('home')} className="flex cursor-pointer items-center gap-2.5">
            <img src={logo} alt="" className="size-8" />
            <span className="title-weight font-title text-lg tracking-(--tracking-title) text-white">ATLAS</span>
          </button>
          <ul className="ml-auto hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => go(n.id)} className="sub t-label cursor-pointer text-dim transition-colors hover:text-accent">
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
          <Button className="ml-auto md:ml-0" onClick={openApp}>Launch ATLAS</Button>
        </nav>
      </header>

      {/* Hero: the live globe from orbit */}
      <section id="home" ref={hero} className="relative h-svh min-h-[560px] overflow-hidden bg-black">
        <div className={`absolute inset-0 transition-opacity duration-[1500ms] ${globeReady ? 'opacity-100' : 'opacity-0'}`}>
          <Suspense fallback={null}>
            <LandingGlobe spot={spot} active={heroOnScreen} onReady={onGlobeReady} />
          </Suspense>
        </div>
        <IssFrame />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <h1 className="title-weight font-title text-[clamp(64px,15vw,220px)] leading-none tracking-[0.14em] pl-[0.14em] text-white [text-shadow:0_0_40px_rgba(127,209,255,0.35),0_2px_18px_rgba(0,0,0,0.8)]">
            ATLAS
          </h1>
          <p className="sub t-label mt-5 text-[clamp(12px,1.4vw,16px)] text-white/85 [text-shadow:0_1px_8px_#000]">Unrest &amp; influence, mapped live</p>
          <div className="pointer-events-auto mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={openApp}>Launch ATLAS</Button>
            <Button variant="secondary" onClick={() => go('about')}>What is ATLAS</Button>
          </div>
        </div>
        <p className="sub t-caption pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-white/60">
          {spot.city ? `Live over ${spot.city}` : 'Live view'} · drag to turn the globe
        </p>
      </section>

      {/* What is ATLAS */}
      <Section id="about" kicker="What is ATLAS" title="One live globe for what's happening, and why">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr]">
          <Reveal className="space-y-4 font-news text-[17px] leading-relaxed text-ink/85">
            <p>
              ATLAS is an open-source intelligence map. It pulls protests, conflict, news, prediction markets, outages,
              aircraft, ships and satellites onto one 3D globe, updated as it happens.
            </p>
            <p>
              It is built for analysts who need to see unrest and influence campaigns side by side: where something is
              happening, who is amplifying it, and what the physical world is doing around it.
            </p>
            <p>Everything on the map says where it came from and how sure we are of its position. No black boxes.</p>
          </Reveal>
          <Reveal delay={150} className="grid grid-cols-2 gap-3 self-start">
            {[
              { v: String(LAYERS.length), k: 'live layers' },
              { v: stats.sources ? String(stats.sources) : '—', k: 'open sources' },
              { v: stats.features ? stats.features.toLocaleString() : '—', k: 'events on the globe now' },
              { v: '0', k: 'keys needed to start' },
            ].map((s) => (
              <div key={s.k} className="chamfer border border-line bg-panel/70 p-4">
                <div className="font-mono text-3xl text-accent tabular-nums">{s.v}</div>
                <div className="sub t-caption mt-1 text-dim">{s.k}</div>
              </div>
            ))}
          </Reveal>
        </div>
      </Section>

      {/* Layers */}
      <Section id="layers" kicker="What it shows" title={`${LAYERS.length} layers, one picture`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LAYERS.map((l, i) => (
            <Reveal key={l.id} delay={(i % 3) * 80}>
              <article className="flex h-full gap-3 border border-line bg-panel/60 p-4 transition-colors hover:border-accent-2/50">
                <span className="w-1 flex-none" style={{ background: l.color }} />
                <div>
                  <h3 className="sub t-label text-white">{l.label}</h3>
                  <p className="mt-1.5 text-[14px] leading-snug text-dim">{l.description}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Sources */}
      <Section id="sources" kicker="Where it comes from" title="Open data, from wires to orbit">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.map((g, i) => (
            <Reveal key={g.group} delay={(i % 3) * 80}>
              <h3 className="sub t-label border-b border-line pb-2 text-accent-2">{g.group}</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {g.items.map((s) => (
                  <li key={s} className="border border-line bg-panel/60 px-2.5 py-1 text-[13px] text-ink/85">{s}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8 max-w-3xl text-[15px] text-dim">
          Most sources need no key at all. Optional keys (ACLED, NASA FIRMS, Cloudflare Radar, YouTube, Claude) switch on more
          layers; until then they show as off, and everything else keeps working.
        </Reveal>
      </Section>

      {/* Technology */}
      <Section id="tech" kicker="Technology" title="How ATLAS works">
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.k} delay={i * 120}>
              <div className="chamfer h-full border border-line bg-panel/60 p-5">
                <div className="font-mono text-accent-2">{s.k}</div>
                <h3 className="title-weight mt-2 font-title text-xl tracking-(--tracking-title) text-white">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-dim">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-14 grid gap-10 md:grid-cols-2">
          <Reveal>
            <h3 className="sub t-label text-accent-2">Honest positions</h3>
            <p className="mt-2 text-[15px] text-dim">Every pin shows how precisely we know where it is.</p>
            <ul className="mt-4 space-y-3">
              {PRECISION.map((p) => (
                <li key={p.label} className="flex items-center gap-3">
                  <span className={`size-4 flex-none ${p.mark}`} />
                  <span className="sub t-label w-28 text-white">{p.label}</span>
                  <span className="text-[14px] text-dim">{p.text}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <h3 className="sub t-label text-accent-2">Built to read influence</h3>
            <ul className="mt-4 space-y-2.5 text-[15px] text-ink/85">
              <li><span className="text-accent-2">›</span> Campaign watch flags stories whose spread looks coordinated.</li>
              <li><span className="text-accent-2">›</span> The network view shows who amplifies whom, and who goes first.</li>
              <li><span className="text-accent-2">›</span> A truth sensor checks trending claims against fact-checks.</li>
              <li><span className="text-accent-2">›</span> An optional AI analyst (Claude) writes a sourced brief per story.</li>
              <li><span className="text-accent-2">›</span> Region watch alerts you when anything new lands inside a circle you draw.</li>
            </ul>
          </Reveal>
        </div>
        <Reveal className="mt-14 font-mono text-[13px] text-dim">
          React · TypeScript · CesiumJS · Hono · server-sent events · SQLite · zod
        </Reveal>
      </Section>

      {/* Closing call to action */}
      <section className="border-t border-line">
        <Reveal className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center sm:px-8">
          <img src={logo} alt="" className="size-16" />
          <h2 className="title-weight mt-6 font-title text-[clamp(26px,4vw,40px)] tracking-(--tracking-title) text-white">See the world as it moves</h2>
          <p className="mt-3 max-w-xl text-dim">Open the globe, switch on the layers you care about, and watch the picture build.</p>
          <Button className="mt-8" onClick={openApp}>Launch ATLAS</Button>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[12px] text-dim sm:px-8">
          <span className="sub t-caption">ATLAS · open-source intelligence</span>
          <span>Imagery Esri · Star map NASA SVS · Globe CesiumJS</span>
        </div>
      </footer>
    </div>
  )
}
