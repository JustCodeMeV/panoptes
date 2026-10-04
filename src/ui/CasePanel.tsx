import { Scroller } from '../../gui_elements/Scroller'
import { useEffect, useState } from 'react'
import { Badge } from '../../gui_elements/Badge'
import { Fold } from '../../gui_elements/Composites'
import { Button } from '../../gui_elements/Button'
import { IconButton, Select, TextField } from '../../gui_elements/Controls'
import { useCases } from '../core/cases'
import { downloadCasePdf } from './casePdf'
import { useStore } from '../core/store'

/** Case file: frozen evidence snapshots with analyst notes; export as JSON. */
export function CasePanel() {
  const { cases, activeId, open, refresh, create, setActive, setNote, remove } = useCases()
  const select = useStore((s) => s.select)
  const [title, setTitle] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  useEffect(() => void refresh(), [refresh])

  return (
    <Fold title="Case file" aside={<Badge>{open?.items.length ?? 0}</Badge>} defaultOpen={false} className="mt-4 border-t border-line pt-3">
      {!open && <p className="t-caption mb-2 text-dim">No case yet: use “Add to case” on any item.</p>}
      <div className="flex flex-col gap-2">
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
            <a className="sub t-label text-accent-2" href={`/api/cases/${activeId}/export`} download title="Raw case data as JSON">
              JSON
            </a>
          )}
        </div>
        {open && (
          <Button
            variant="secondary"
            className="w-full"
            loading={pdfBusy}
            onClick={() => {
              setPdfBusy(true)
              void downloadCasePdf(open).finally(() => setPdfBusy(false))
            }}
          >
            Output case to PDF
          </Button>
        )}
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
        <Scroller innerClassName="max-h-[30vh] pr-2">
          <ul className="flex flex-col gap-2">
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
        </Scroller>
      </div>
    </Fold>
  )
}
