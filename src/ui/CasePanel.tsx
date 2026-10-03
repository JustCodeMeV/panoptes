import { useEffect, useState } from 'react'
import { Badge } from '../../gui_elements/Badge'
import { Button } from '../../gui_elements/Button'
import { IconButton, Select, TextField } from '../../gui_elements/Controls'
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
    <section className="mt-4 border-t border-line pt-3">
      <div className="flex items-center gap-2">
        <button type="button" className="sub t-label flex-1 cursor-pointer text-left text-accent" onClick={() => setExpanded(!expanded)}>
          Case file
        </button>
        <Badge>{open?.items.length ?? 0}</Badge>
        <IconButton icon={expanded ? 'collapse' : 'expand'} onClick={() => setExpanded(!expanded)} />
      </div>
      {!expanded && <p className="t-caption mt-1 text-dim">{open ? open.title : 'No case yet: use “Add to case” on any item.'}</p>}
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Select label="Active case" value={activeId ?? ''} onChange={(e) => void setActive(Number(e.target.value) || null)}>
                {cases.length === 0 && <option value="">(none)</option>}
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.items})
                  </option>
                ))}
              </Select>
            </div>
            {activeId && (
              <a className="sub t-label text-accent-2" href={`/api/cases/${activeId}/export`} download>
                Export
              </a>
            )}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim()) {
                void create(title.trim())
                setTitle('')
              }
            }}
          >
            <div className="min-w-0 flex-1">
              <TextField value={title} onChange={setTitle} placeholder="New case title…" label="New case title" />
            </div>
            <Button type="submit" variant="secondary">Create</Button>
          </form>
          <ul className="flex max-h-[30vh] flex-col gap-2 overflow-y-auto">
            {open?.items.map((i) => (
              <li key={i.id} className="flex flex-col gap-1 border border-line p-2">
                <div className="flex items-start gap-2">
                  <button type="button" className="t-caption flex-1 cursor-pointer text-left leading-snug hover:text-accent" onClick={() => select(i.feature_id)} title="Select if still live">
                    {i.feature.title}
                  </button>
                  <IconButton icon="close" onClick={() => void remove(i.id)} />
                </div>
                <small className="sub t-caption text-dim">
                  {i.feature.layerId} · saved {new Date(i.added).toLocaleTimeString()}
                </small>
                <textarea
                  className="case-note"
                  defaultValue={i.note}
                  placeholder="Analyst note…"
                  rows={2}
                  onBlur={(e) => e.target.value !== i.note && void setNote(i.id, e.target.value)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
