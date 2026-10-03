import { useState } from 'react'
import { LAYERS } from '../layers'
import { useStore } from '../core/store'

function ago(iso?: string) {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`
}

export function LayerPanel() {
  const layers = useStore((s) => s.layers)
  const toggle = useStore((s) => s.toggle)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const [open, setOpen] = useState<Record<string, boolean>>({ livestreams: true })

  return (
    <aside className="panel">
      <header>
        <h1>PANOPTES</h1>
        <span>open-source unrest &amp; influence mapping</span>
      </header>
      {LAYERS.map((def) => {
        const st = layers[def.id]
        const features = st.data?.features ?? []
        const sorted = [...features].sort(
          (a, b) => (Number(b.props.viewers) || 0) - (Number(a.props.viewers) || 0),
        )
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
                  <span>updated {ago(st.data?.generatedAt)}</span>
                )}
                {st.data?.providers.map((p) => (
                  <span key={p.id} className={p.ok ? 'ok' : 'err'} title={p.error ?? `${p.ms} ms`}>
                    {p.id} {p.ok ? p.count : '✕'}
                  </span>
                ))}
              </div>
            )}
            {st.enabled && open[def.id] && (
              <ul className="list">
                {sorted.map((f) => (
                  <li key={f.id}>
                    <button
                      className={f.id === selectedId ? 'on' : ''}
                      onClick={() => select(f.id)}
                    >
                      <span className={`dot dot-${f.geoPrecision}`} />
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
      <footer>
        <span className="dot dot-exact" /> exact <span className="dot dot-approximate" /> approx{' '}
        <span className="dot dot-inferred" /> inferred
      </footer>
    </aside>
  )
}
