import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../gui_elements/Button'
import { FeedItem, Header, LayerPanel as LayerList, Legend, type Layer } from '../../gui_elements/Composites'
import { Check, IconButton, Search } from '../../gui_elements/Controls'
import { RollUp } from '../../gui_elements/Motion'
import { Panel } from '../../gui_elements/Panel'
import type { Feature } from '../../shared/feature'
import { featuresOf, useStore, type LayerState } from '../core/store'
import type { LayerDef } from '../core/types'
import { LAYERS } from '../layers'
import { CasePanel } from './CasePanel'
import { DemoButton } from './DemoBanner'
import { Health } from './Health'
import { LiveFeed } from './LiveFeed'
import { NetworkView } from './NetworkGraph'
import { useShell, type PanelBox } from './shell'
import { ago, useNow } from './useNow'

const matches = (f: Feature, q: string) => !q || f.title.toLowerCase().includes(q)

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

/** Left panel: header, search, layers (with their sources, controls and features), live feed, case file, legend. */
export function LayerPanel({ box }: { box: PanelBox }) {
  const layerStates = useStore((s) => s.layers)
  const toggle = useStore((s) => s.toggle)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const pin = useStore((s) => s.pin)
  const live = useStore((s) => s.live)
  const leftMin = useShell((s) => s.leftMin)
  const setShell = useShell((s) => s.set)
  const now = useNow(1000)
  const [query, setQuery] = useState('')
  const [net, setNet] = useState<false | 'flagged' | 'all'>(false)
  const q = query.trim().toLowerCase()

  const layers: Layer[] = LAYERS.map((def) => {
    const st = layerStates[def.id]
    const rank = def.rank ?? ((f: Feature) => Number(f.props.viewers) || 0)
    const features = featuresOf(st)
      .filter((f) => matches(f, q))
      .sort((a, b) => rank(b) - rank(a))
    return {
      id: def.id,
      label: def.label,
      count: st.loading && !st.data ? '…' : features.length,
      on: st.enabled,
      desc: def.description,
      status: '',
      color: def.color,
      extra: st.enabled && (
        <div className="mt-1.5 flex flex-col gap-2">
          <SourceStatus def={def} st={st} live={live[def.id]} now={now} />
          {def.Controls && <def.Controls pin={pin} />}
          {features.length > 0 && (
            <div className="-mx-1.5 max-h-[28vh] overflow-y-auto">
              {features.slice(0, 40).map((f) => (
                <FeedItem
                  key={f.id}
                  entry={{ id: f.id, title: f.title, sub: def.subtitle(f), p: f.geoPrecision, time: '', viewers: '', color: def.pin(f).color ?? def.color }}
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

  return (
    <div className="absolute z-10" style={{ left: box.inset, top: box.top, width: box.width, height: box.height }}>
      <RollUp minimized={leftMin} className="h-full">
        <Panel className="h-full">
          <div className="flex h-full flex-col overflow-y-auto pr-1">
            <div data-roll-keep>
              <div className="flex items-start justify-between gap-2">
                <Header />
                <IconButton icon={leftMin ? 'expand' : 'collapse'} onClick={() => setShell({ leftMin: !leftMin })} />
              </div>
              <div className="mt-3">
                <Search value={query} onChange={setQuery} placeholder="Search features" label="Search features" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Health />
              <DemoButton />
              <Button variant="secondary" onClick={() => setNet(net ? false : 'flagged')} title="Who amplifies the same stories, and who goes first">
                Network
              </Button>
            </div>
            <div className="mt-4">
              <LayerList layers={layers} onToggle={(id) => toggle(id)} defaultOpen="campaigns" />
            </div>
            <LiveFeed />
            <CasePanel />
            <div className="mt-4 border-t border-line pt-3">
              <Legend layers={layers.filter((l) => l.on)} />
            </div>
          </div>
        </Panel>
      </RollUp>

      {net &&
        createPortal(
          // Rendered inside the ATLAS root so it keeps the design tokens
          <div className="fixed top-1/2 left-1/2 z-30 w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2">
            <Panel>
              <div className="max-h-[calc(100vh-64px)] overflow-y-auto">
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
              </div>
            </Panel>
          </div>,
          document.querySelector('.atlas') ?? document.body,
        )}
    </div>
  )
}
