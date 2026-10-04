import { useEffect, useMemo, useRef, useState } from 'react'
import { featuresOf, useStore } from '../core/store'
import { timedFeatures, timeRange } from '../core/time'
import { LAYERS } from '../layers'

const HOUR = 3_600_000
const fmt = (t: number) => new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * TIMELINE: scrub or play the map back in time to see when things appeared. A replay of what the
 * live layers hold (their recent history), not an archive; layers without history stay as they are.
 */
export function TimeBar() {
  const layers = useStore((s) => s.layers)
  const cursor = useStore((s) => s.timeCursor)
  const setCursor = useStore((s) => s.setTimeCursor)
  const select = useStore((s) => s.select)
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)

  const timed = useMemo(() => timedFeatures(LAYERS.filter((d) => layers[d.id]?.enabled).map((d) => ({ id: d.id, features: featuresOf(layers[d.id]) }))), [layers])
  const [lo, hi] = useMemo(() => timeRange(timed), [timed])
  const span = Math.max(HOUR, hi - lo)
  const bins = useMemo(() => {
    const n = Math.min(96, Math.max(12, Math.ceil(span / HOUR)))
    const out = new Array<number>(n).fill(0)
    for (const f of timed) {
      const t = Date.parse(f.observedAt)
      if (t >= lo && t <= hi) out[Math.min(n - 1, Math.floor(((t - lo) / span) * n))]++
    }
    return out
  }, [timed, lo, hi, span])
  const max = Math.max(1, ...bins)
  const now = cursor ?? hi
  const shown = timed.filter((f) => Date.parse(f.observedAt) <= now).length
  const fresh = useMemo(
    () => (cursor === null ? [] : timed.filter((f) => { const t = Date.parse(f.observedAt); return t <= cursor && t > cursor - HOUR }).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 5)),
    [timed, cursor],
  )

  // Play: sweep from the earliest item to now in ~20 s
  useEffect(() => {
    if (!playing) return
    const start = performance.now()
    const from = cursor !== null && cursor < hi - span * 0.02 ? cursor : lo
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 20_000)
      const next = from + (hi - from) * k
      if (k >= 1) {
        setPlaying(false)
        setCursor(null)
        return
      }
      setCursor(next)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cursor !== null) {
        setPlaying(false)
        setCursor(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursor, setCursor])

  if (!open)
    return (
      <button type="button" className="timebar-pill" onClick={() => setOpen(true)} title="Go back in time: see when things appeared">
        ◷ Timeline{cursor !== null ? ` · ${fmt(cursor)}` : ''}
      </button>
    )

  const live = () => {
    setPlaying(false)
    setCursor(null)
  }
  return (
    <div className="timebar" role="group" aria-label="Timeline">
      <div className="timebar-head">
        <b>{cursor === null ? 'Live' : `As of ${fmt(cursor)}`}</b>
        <span>
          {shown} of {timed.length} items · history held by the live layers: {Math.round(span / HOUR)} h
        </span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close timeline">×</button>
      </div>
      <div className="timebar-hist" aria-hidden>
        {bins.map((n, i) => (
          <span key={i} style={{ height: `${Math.sqrt(n / max) * 100}%`, opacity: lo + ((i + 0.5) / bins.length) * span <= now ? 1 : 0.25 }} />
        ))}
      </div>
      <input
        type="range"
        min={lo}
        max={hi}
        step={60_000}
        value={now}
        aria-label="Moment shown on the map"
        onChange={(e) => {
          setPlaying(false)
          const v = Number(e.target.value)
          setCursor(v >= hi - 60_000 ? null : v)
        }}
      />
      <div className="timebar-ctl">
        <button type="button" onClick={() => setCursor(Math.max(lo, now - HOUR))}>−1 h</button>
        <button type="button" onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button type="button" onClick={() => { const v = now + HOUR; setCursor(v >= hi ? null : v) }}>+1 h</button>
        <button type="button" className={cursor === null ? 'on' : ''} onClick={live}>● Live</button>
        <span className="timebar-range">{fmt(lo)} → now</span>
      </div>
      {fresh.length > 0 && (
        <ul className="timebar-fresh">
          <li className="lbl">Appeared in the hour before</li>
          {fresh.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => select(f.id)}>{f.title}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
