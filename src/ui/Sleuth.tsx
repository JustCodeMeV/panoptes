import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../gui_elements/Button'
import { IconButton } from '../../gui_elements/Controls'
import { Panel } from '../../gui_elements/Panel'
import { Scroller } from '../../gui_elements/Scroller'
import { flyTo } from '../core/investigation'
import { imageOf, reverseLinks, useSleuth, type SleuthRun } from '../core/sleuth'
import { setCaseMode } from './shell'

const STATUS: Record<SleuthRun['status'], string> = { intake: 'Reading the photo (metadata, text, reverse image search)…', running: 'Investigating…', done: 'Done', failed: 'Failed', cancelled: 'Stopped' }
const usd = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`
const dist = (m?: number) => (m === undefined ? '?' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

function Form() {
  const item = useSleuth((s) => s.item)
  const status = useSleuth((s) => s.status)
  const busy = useSleuth((s) => s.busy)
  const start = useSleuth((s) => s.start)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [purpose, setPurpose] = useState(item ? 'Verify where the photo in this post was taken, against what the post claims' : '')
  const [note, setNote] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const img = item && imageOf(item)
  const ready = status?.llm && status.toolServer
  const can = !!ready && purpose.trim().length >= 3 && !!(item || file || url.trim())

  const submit = () => {
    if (item) return void start({ featureId: item.id, purpose, context: note })
    if (file) {
      const fd = new FormData()
      fd.set('photo', file)
      fd.set('purpose', purpose)
      fd.set('context', note)
      return void start(fd)
    }
    void start({ url: url.trim(), purpose, context: note })
  }

  return (
    <div className="sleuth-form">
      {item ? (
        <div className="sleuth-item">
          {img && <img src={img} alt="" />}
          <span>{item.title}</span>
        </div>
      ) : (
        <>
          <div
            className={`sleuth-drop ${drag ? 'on' : ''}`}
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              const f = e.dataTransfer.files[0]
              if (f) setFile(f)
            }}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
          >
            {file ? `📷 ${file.name} (${Math.round(file.size / 1024)} KB)` : 'Drop a photo here, or click to choose one'}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {!file && <input className="sleuth-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or an image URL (https://…)" aria-label="Image URL" />}
        </>
      )}
      <label className="sleuth-label">
        Purpose <em>(required: who is in it and why you need its location)</em>
        <input className="sleuth-input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. verify a claimed strike location" />
      </label>
      <label className="sleuth-label">
        Note <em>(optional: what is claimed, what you already know)</em>
        <textarea className="sleuth-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="sleuth-actions">
        <Button disabled={!can} loading={busy} onClick={submit}>
          Geolocate
        </Button>
        {status && (
          <span className="sleuth-meta">
            {!status.toolServer
              ? 'Geolocation service offline'
              : !status.llm
                ? 'No AI provider that can see images is configured: add a free key (Gemini, Mistral, OpenRouter or Pollinations)'
                : `${status.providers.map((p) => p.id + (p.free ? '' : ' (paid)')).join(' → ')} · up to ${status.defaults.steps} steps, paid calls capped at ${usd(status.defaults.usd)} · today ${usd(status.spentTodayUsd)} of ${usd(status.dailyCapUsd)}`}
          </span>
        )}
      </div>
      <p className="sleuth-hint">
        ARGUS runs the geo-sleuth method: metadata, text, reverse image search, lookup tables, sun angles, OpenStreetMap, terrain and satellite ranking, each conclusion checked against data. The free steps run first; the paid AI looks only at what the tools ranked highest.
      </p>
    </div>
  )
}

function RunView({ run }: { run: SleuthRun }) {
  const harder = useSleuth((s) => s.harder)
  const cancel = useSleuth((s) => s.cancel)
  const reset = useSleuth((s) => s.reset)
  const show = useSleuth((s) => s.show)
  const busy = useSleuth((s) => s.busy)
  const harderLevels = useSleuth((s) => s.status?.harder ?? [])
  const next = run.model.includes('claude-opus') ? undefined : run.model.includes('claude-sonnet') ? harderLevels[1] : harderLevels[0]
  const [big, setBig] = useState<string | null>(null)
  const live = run.status === 'intake' || run.status === 'running'
  const f = run.finding
  const located = f?.lat !== undefined && f.lon !== undefined
  const log = useRef<HTMLOListElement>(null)
  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: 'nearest' })
  }, [run.steps.length])
  const report = run.report?.replace(/```json[\s\S]*?```\s*$/, '').trim()

  return (
    <div className="sleuth-run">
      <div className="sleuth-head">
        <b>{STATUS[run.status]}</b>
        <span className="sleuth-meta">
          {run.model || 'starting'} · {run.toolCalls}/{run.budget.steps} steps · {usd(run.costUsd)} of {usd(run.budget.usd)}
        </span>
      </div>
      {run.error && <p className="sleuth-error">{run.error}</p>}
      {located && (
        <div className="sleuth-finding">
          <div>
            <b>{f!.place ?? 'Located'}</b> <em>±{dist(f!.radius_m)} · {f!.level} level · {f!.confidence} confidence</em>
          </div>
          <code>
            {f!.lat!.toFixed(5)}, {f!.lon!.toFixed(5)}
            {typeof f!.heading_deg === 'number' && ` · facing ${Math.round(f!.heading_deg)}°`}
            {f!.captured_at && ` · ${f!.captured_at}`}
          </code>
          <div className="sleuth-actions">
            <Button
              variant="secondary"
              onClick={() => {
                show(true)
                setCaseMode(false)
                setTimeout(() => flyTo(f!.lat!, f!.lon!), 300)
              }}
            >
              Show on the globe
            </Button>
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(`${f!.lat}, ${f!.lon}`)}>
              Copy coordinates
            </Button>
          </div>
        </div>
      )}
      {!live && run.status !== 'cancelled' && !located && run.report && <p className="sleuth-error">No location could be supported with the evidence found. The report says what is missing.</p>}
      <ol ref={log} className="sleuth-log">
        {run.steps.map((s, i) => (
          <li key={i} className={s.kind === 'error' || s.ok === false ? 'bad' : s.kind === 'note' ? 'note' : ''}>
            {s.kind === 'tool' ? '▸ ' : ''}
            {s.text}
          </li>
        ))}
        {live && <li className="note">…</li>}
      </ol>
      {run.images.length > 0 && (
        <div className="sleuth-images">
          {run.images.map((p) => (
            <button key={p} type="button" onClick={() => setBig(p)} title={p}>
              <img src={`/api/sleuth/${run.id}/file/${p}?max=360`} alt={p} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {big && (
        <button type="button" className="sleuth-big" onClick={() => setBig(null)} title="Close">
          <img src={`/api/sleuth/${run.id}/file/${big}?max=1600`} alt={big} />
        </button>
      )}
      {report && <div className="sleuth-report">{report}</div>}
      {run.source.url && (
        <p className="sleuth-meta">
          Reverse search in your browser:{' '}
          {reverseLinks(run.source.url).map(([name, href], i) => (
            <span key={name}>
              {i > 0 && ' · '}
              <a href={href} target="_blank" rel="noreferrer noopener">
                {name}
              </a>
            </span>
          ))}
        </p>
      )}
      <div className="sleuth-actions">
        {live ? (
          <Button variant="secondary" onClick={() => void cancel()}>
            Stop
          </Button>
        ) : (
          <>
            {next && run.status === 'done' && (
              <Button variant="secondary" loading={busy} onClick={() => void harder()} title="Continue the same investigation on a stronger (paid) model, with a new budget">
                Look harder ({next})
              </Button>
            )}
            <Button variant="secondary" onClick={reset}>
              New photo
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** Photo geolocation: one dialog, from the form to the evidence. */
export function Sleuth() {
  const open = useSleuth((s) => s.open)
  const close = useSleuth((s) => s.close)
  const run = useSleuth((s) => s.run)
  const error = useSleuth((s) => s.error)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, close])
  if (!open) return null
  return createPortal(
    <div className="fixed top-1/2 left-1/2 z-40 w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2" role="dialog" aria-label="Geolocate a photo">
      <Panel>
        <Scroller innerClassName="max-h-[calc(100vh-96px)] pr-2">
          <div className="mb-3 flex items-center gap-3">
            <span className="sub t-label text-accent">Geolocate a photo</span>
            <span className="ml-auto">
              <IconButton icon="close" onClick={close} />
            </span>
          </div>
          {error && <p className="sleuth-error">{error}</p>}
          {run ? <RunView run={run} /> : <Form />}
        </Scroller>
      </Panel>
    </div>,
    document.querySelector('.argus') ?? document.body,
  )
}
