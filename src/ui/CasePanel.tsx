import { useEffect, useState } from 'react'
import { useCases } from '../core/cases'
import { useStore } from '../core/store'

/** Case file: frozen evidence snapshots with analyst notes; export as JSON. */
export function CasePanel() {
  const { cases, activeId, open, refresh, create, setActive, setNote, remove } = useCases()
  const select = useStore((s) => s.select)
  const [title, setTitle] = useState('')
  const [expanded, setExpanded] = useState(false)
  useEffect(() => void refresh(), [refresh])

  return (
    <section className="layer case" style={{ ['--c' as string]: '#94a3b8' }}>
      <div className="layer-head">
        <button className="title" onClick={() => setExpanded(!expanded)}>
          📁 Case file
        </button>
        <span className="count" style={{ background: '#475569' }}>{open?.items.length ?? 0}</span>
      </div>
      {!expanded && <p className="desc">{open ? open.title : 'No case yet: use “Add to case” on any item.'}</p>}
      {expanded && (
        <>
          <div className="case-row">
            <select value={activeId ?? ''} onChange={(e) => void setActive(Number(e.target.value) || null)}>
              {cases.length === 0 && <option value="">(none)</option>}
              {cases.map((c) => (
                <option key={c.id} value={c.id}>{c.title} ({c.items})</option>
              ))}
            </select>
            {activeId && (
              <a className="btn" href={`/api/cases/${activeId}/export`} download>Export</a>
            )}
          </div>
          <form className="case-row" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { void create(title.trim()); setTitle('') } }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New case title…" />
            <button type="submit">Create</button>
          </form>
          <ul className="case-items">
            {open?.items.map((i) => (
              <li key={i.id}>
                <button className="ct" onClick={() => select(i.feature_id)} title="Select if still live">{i.feature.title}</button>
                <small>{i.feature.layerId} · saved {new Date(i.added).toLocaleTimeString()}</small>
                <textarea defaultValue={i.note} placeholder="Analyst note…" rows={2} onBlur={(e) => e.target.value !== i.note && void setNote(i.id, e.target.value)} />
                <button className="rm" onClick={() => void remove(i.id)}>remove</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
