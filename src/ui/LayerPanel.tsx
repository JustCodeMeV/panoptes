import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../gui_elements/Button'
import { FeedItem, Fold, Header, LayerPanel as LayerList, Legend, type Layer } from '../../gui_elements/Composites'
import { Check, IconButton } from '../../gui_elements/Controls'
import { Toggle } from '../../gui_elements/Toggle'
import { RollUp } from '../../gui_elements/Motion'
import { Scroller } from '../../gui_elements/Scroller'
import { Panel } from '../../gui_elements/Panel'
import type { Feature } from '../../shared/feature'
import { srcTag } from '../../shared/lang'
import { featuresOf, useStore, type LayerState } from '../core/store'
import { LAYER_GROUPS, type LayerDef } from '../core/types'
import logo from '../assets/ARGUS_LOGO.png'
import { LAYERS } from '../layers'
import { LANDING_HASH } from '../route'
import { useGlobeUi } from '../globe/globeUi'
import { useArgusControls } from '../../gui_elements/context'
import { CasePanel } from './CasePanel'
import { DemoButton } from './DemoBanner'
import { Health } from './Health'
import { NetworkView } from './NetworkGraph'
import { Omnibox } from './Omnibox'
import { matchesQuery } from '../core/search'
import { useShell, type PanelBox } from './shell'
import { useEscape } from './useEscape'
import { ago, useNow } from './useNow'

const DARK_SIDE = 'dark-side'

/** Status line under an expanded layer: freshness / live state and per-source health. */
function SourceStatus({ def, st, live, now }: { def: LayerDef; st: LayerState; live?: { connected: boolean }; now: number }) {
  if (st.error) return <p className="sub t-caption text-err">API error: {st.error}</p>
  const providers = st.data?.providers ?? []
  const down = providers.filter((p) => !p.ok)
  return (
    <p className="sub t-caption flex flex-wrap gap-x-3 gap-y-0.5 text-dim">
      <span className={def.stream && live?.connected ? 'text-live' : ''}>
        {def.stream ? (live?.connected ? '● live' : '○ reconnecting') : `updated ${ago(st.data?.generatedAt, now)}`}
      </span>
      {providers.length > 6 ? (
        <span className="text-ok" title={providers.map((p) => `${p.id} ${p.ok ? p.count : 'down'}`).join('\n')}>
          {providers.length - down.length}/{providers.length} sources ok
        </span>
      ) : (
        providers
          .filter((p) => p.ok)
          .map((p) => (
            <span key={p.id} className="text-ok" title={`${p.ms} ms`}>
              {p.id} {p.count}
            </span>
          ))
      )}
      {down.map((p) => (
        <span key={p.id} className="text-err" title={p.error}>
          {p.id} ✕
        </span>
      ))}
    </p>
  )
}

/**
 * The logo, linking to the landing page. Its hover glow is drawn in a layer above every panel
 * (the panel's clipped frame would otherwise cut it off and draw its border over it).
 */
function LogoLink() {
  const [glow, setGlow] = useState<DOMRect | null>(null)
  return (
    <a
      href={LANDING_HASH}
      title="About ARGUS"
      className="flex-none"
      onPointerEnter={(e) => setGlow(e.currentTarget.getBoundingClientRect())}
      onPointerLeave={() => setGlow(null)}
      onClick={() => setGlow(null)}
    >
      <img src={logo} alt="ARGUS home" className="block size-[calc(var(--fs-title)*1.3)]" />
      {glow &&
        createPortal(
          <img
            src={logo}
            alt=""
            aria-hidden
            className="pointer-events-none fixed z-[100] animate-[fade-in_200ms_ease-out] [filter:drop-shadow(0_0_5px_var(--color-accent-2))_drop-shadow(0_0_14px_var(--color-accent-2))]"
            style={{ left: glow.left, top: glow.top, width: glow.width, height: glow.height }}
          />,
          document.querySelector('.argus') ?? document.body,
        )}
    </a>
  )
}

/** Left panel: header, search, layers (with their sources, controls and features), live feed, case file, legend. */
export function LayerPanel({ box }: { box: PanelBox }) {
  const layerStates = useStore((s) => s.layers)
  const toggle = useStore((s) => s.toggle)
  const setEnabled = useStore((s) => s.setEnabled)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const pin = useStore((s) => s.pin)
  const live = useStore((s) => s.live)
  const leftMin = useShell((s) => s.leftMin)
  const setShell = useShell((s) => s.set)
  const now = useNow(1000)
  const [query, setQuery] = useState('')
  const [net, setNet] = useState<false | 'flagged' | 'all'>(false)
  useEscape(!!net, () => setNet(false))
  const q = query.trim().toLowerCase()
  const darkSide = useGlobeUi((s) => s.darkSide)
  const toggleDarkSide = useGlobeUi((s) => s.toggleDarkSide)
  const { satellite } = useArgusControls()

  const visible = LAYERS.filter((def) => !def.hidden)
  const layers: (Layer & { group: string })[] = visible.map((def) => {
    const st = layerStates[def.id]
    const rank = def.rank ?? ((f: Feature) => Number(f.props.viewers) || 0)
    const features = featuresOf(st)
      .filter((f) => matchesQuery(f, q))
      .sort((a, b) => rank(b) - rank(a))
    return {
      id: def.id,
      group: def.group ?? LAYER_GROUPS[0],
      label: def.label,
      count: st.loading && !st.data ? '…' : features.length,
      on: st.enabled,
      desc: def.description,
      status: '',
      color: def.color,
      extra: st.enabled && (
        <div className="mt-1.5 flex flex-col gap-2">
          <SourceStatus def={def} st={st} live={live[def.id]} now={now} />
          {def.Controls && <def.Controls pin={pin} features={features} select={select} />}
          {features.length > 0 && (
            // Full height: an opened layer takes the whole panel if it needs it (the panel scrolls)
            <div className="-mx-1.5 pr-2">
              {features.slice(0, 40).map((f) => (
                <FeedItem
                  key={f.id}
                  entry={{ id: f.id, title: f.title, sub: [srcTag(f.props), def.subtitle(f)].filter(Boolean).join(' · '), p: f.geoPrecision, time: '', viewers: '', color: def.pin(f).color ?? def.color }}
                  selected={f.id === selectedId}
                  onClick={() => select(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      ),
    }
  })

  const allOn = darkSide && layers.every((l) => l.on)

  // Not a data layer: the globe's own day/night view, listed with the layers so it's easy to find
  const darkLayer: Layer = {
    id: DARK_SIDE,
    label: 'Day & Night',
    count: '☾',
    on: darkSide,
    desc: 'Day and night as they are right now: the real sunrise line (following the seasons and the Earth\u2019s tilt), with city lights on the night side (NASA Black Marble).',
    status: '',
    color: '#7c86ff',
    extra: !satellite && <p className="sub t-caption text-dim">Shows in satellite view (map button in the globe controls).</p>,
  }

  return (
    // Only as tall as its content, up to the layout's full height
    <div className="absolute z-10 flex flex-col" style={{ left: box.inset, top: box.top, width: box.width, maxHeight: box.height }}>
      <RollUp minimized={leftMin} className="flex min-h-0 flex-col">
        <Panel className="min-h-0" onMinimize={() => setShell({ leftMin: !leftMin })} minimized={leftMin}>
          <div className="flex min-h-0 flex-auto flex-col">
            {/* Pinned: logo, name and search stay put while the rest scrolls under them */}
            {/* data-roll-keep="flush": minimised, the panel ends exactly on this block's bottom line */}
            <div data-roll-keep="flush" className="flex-none border-b border-line/60 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <LogoLink />
                  <Header />
                </div>
              </div>
              <div className="mt-3">
                <Omnibox query={query} setQuery={setQuery} />
              </div>
            </div>
            <Scroller className="flex-auto" innerClassName="pr-2.5">
              {/* Two equal buttons on one line, never wrapping */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <DemoButton className="w-full whitespace-nowrap" />
                <Button variant="secondary" className="w-full whitespace-nowrap" onClick={() => setNet(net ? false : 'flagged')} title="Who amplifies the same stories, and who goes first">
                  Network
                </Button>
              </div>
              <Fold
                title="Layers"
                aside={
                  // Master switch, in line with every layer's own switch below
                  <span className="flex items-center gap-3">
                    <Health />
                    <span className="-mr-1">
                      <Toggle
                        checked={allOn}
                        onChange={(on) => {
                          setEnabled(layers.map((l) => l.id), on)
                          if (darkSide !== on) toggleDarkSide()
                        }}
                        label={allOn ? 'Switch every layer off' : 'Switch every layer on'}
                      />
                    </span>
                  </span>
                }
                className="mt-4"
              >
                {/* One fold per group; the first three start open */}
                {LAYER_GROUPS.map((g, i) => {
                  const inGroup: Layer[] = [...layers.filter((l) => l.group === g), ...(g === LAYER_GROUPS[LAYER_GROUPS.length - 1] ? [darkLayer] : [])]
                  if (!inGroup.length) return null
                  return (
                    <Fold key={g} title={g} aside={<span className="sub t-caption text-dim">{inGroup.filter((l) => l.on).length}/{inGroup.length} on</span>} defaultOpen={i < 3} className="mt-2.5 border-l border-line/60 pl-2">
                      <LayerList heading={false} layers={inGroup} onToggle={(id) => (id === DARK_SIDE ? toggleDarkSide() : toggle(id))} defaultOpen={g === LAYER_GROUPS[0] ? 'campaigns' : ''} />
                    </Fold>
                  )
                })}
              </Fold>
              <CasePanel />
              <Fold title="Key" className="mt-4 border-t border-line pt-3">
                <Legend heading={false} layers={layers.filter((l) => l.on)} />
              </Fold>
            </Scroller>
          </div>
        </Panel>
      </RollUp>

      {net &&
        createPortal(
          // Rendered inside the ARGUS root so it keeps the design tokens
          <div className="fixed top-1/2 left-1/2 z-30 w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2">
            <Panel>
              <Scroller innerClassName="max-h-[calc(100vh-64px)] pr-2">
                <div className="mb-3 flex items-center gap-3">
                  <span className="sub t-label text-accent">Influence network</span>
                  <Check checked={net === 'all'} onChange={() => setNet(net === 'all' ? 'flagged' : 'all')} label="All stories, not just flagged" />
                  <span className="ml-auto"><IconButton icon="close" onClick={() => setNet(false)} /></span>
                </div>
                <NetworkView key={net} all={net === 'all'} height={420} onStory={(id) => select(id)} />
                <p className="note">
                  Sources linked when both carried a story within 6 h; arrows point from the source that was usually first. Red = same pair on 3+ flagged
                  stories. Leads, not attribution.
                </p>
              </Scroller>
            </Panel>
          </div>,
          document.querySelector('.argus') ?? document.body,
        )}
    </div>
  )
}
