import { useState } from 'react'
import { LAYERS } from '../layers'
import { featuresOf, useStore } from '../core/store'
import { CasePanel } from './CasePanel'
import { Health } from './Health'
import { ago, useNow } from './useNow'

export function LayerPanel() {
  const layers = useStore((s) => s.layers)
  const toggle = useStore((s) => s.toggle)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const pin = useStore((s) => s.pin)
  const live = useStore((s) => s.live)
  const now = useNow(1000)
  const [open, setOpen] = useState<Record<string, boolean>>({ campaigns: true })

  return (
    <aside className="panel">
      <header>
        <h1>PANOPTES</h1>
        <span>open-source unrest &amp; influence mapping</span> <Health />
      </header>
      {LAYERS.map((def) => {
        const st = layers[def.id]
        const features = featuresOf(st)
        const rank = def.rank ?? ((f) => Number(f.props.viewers) || 0)
        const sorted = [...features].sort((a, b) => rank(b) - rank(a))
        return (
          <section key={def.id} className="layer" style={{ ['--c' as string]: def.color }}>
            <div className="layer-head">
              <label className="switch">
                <input type="checkbox" checked={st.enabled} onChange={() => toggle(def.id)} />
                <i />
              </label>
              <button className="title" onClick={() => setOpen({ ...open, [def.id]: !open[def.id] })}>
                {def.label}
              </button>
              <span className="count">{st.loading && !st.data ? '…' : features.length}</span>
            </div>
            <p className="desc">{def.description}</p>
            {st.enabled && (
              <div className="status">
                {st.error ? (
                  <span className="err">API error: {st.error}</span>
                ) : (
                  <span>
                    {def.stream ? (live[def.id]?.connected ? '● live' : '○ reconnecting') : `updated ${ago(st.data?.generatedAt, now)}`}
                  </span>
                )}
                {(st.data?.providers.length ?? 0) > 6 ? (
                  <>
                    <span className="ok" title={st.data?.providers.map((p) => `${p.id} ${p.ok ? p.count : 'down'}`).join('\n')}>
                      {st.data?.providers.filter((p) => p.ok).length}/{st.data?.providers.length} sources ok
                    </span>
                    {st.data?.providers
                      .filter((p) => !p.ok)
                      .map((p) => (
                        <span key={p.id} className="err" title={p.error}>
                          {p.id} ✕
                        </span>
                      ))}
                  </>
                ) : (
                  st.data?.providers.map((p) => (
                    <span key={p.id} className={p.ok ? 'ok' : 'err'} title={p.error ?? `${p.ms} ms`}>
                      {p.id} {p.ok ? p.count : '✕'}
                    </span>
                  ))
                )}
              </div>
            )}
            {st.enabled && def.Controls && <def.Controls pin={pin} />}
            {st.enabled && open[def.id] && (
              <ul className="list">
                {sorted.slice(0, 40).map((f) => (
                  <li key={f.id}>
                    <button
                      className={f.id === selectedId ? 'on' : ''}
                      onClick={() => select(f.id)}
                    >
                      <span
                        className={`dot dot-${f.geoPrecision}`}
                        style={{ ['--dc' as string]: def.pin(f).color ?? def.color }}
                      />
                      <span className="t">{f.title}</span>
                      <span className="s">{def.subtitle(f)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
      <CasePanel />
      <footer>
        <span className="dot dot-exact" /> exact <span className="dot dot-approximate" /> approx{' '}
        <span className="dot dot-inferred" /> inferred <span className="dot dot-none" /> unplaced
      </footer>
    </aside>
  )
}
