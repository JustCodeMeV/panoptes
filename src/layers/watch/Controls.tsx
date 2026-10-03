import { useEffect, useState } from 'react'
import { useWatches } from './state'

/** Add a watch by place name ("Strait of Hormuz") or "lat, lon"; list and remove. */
export function WatchControls() {
  const { list, error, load, add, remove } = useWatches()
  const [place, setPlace] = useState('')
  const [radius, setRadius] = useState(200)
  const [busy, setBusy] = useState(false)
  useEffect(() => void load(), [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!place.trim()) return
    setBusy(true)
    const m = place.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/)
    const ok = await add(m ? { lat: Number(m[1]), lon: Number(m[2]), radiusKm: radius } : { place, radiusKm: radius })
    setBusy(false)
    if (ok) setPlace('')
  }

  return (
    <div className="watch-ctl">
      <form onSubmit={submit}>
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place or lat, lon (e.g. Strait of Hormuz)" />
        <label title="Radius">
          <input type="range" min={25} max={1000} step={25} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
          <span>{radius} km</span>
        </label>
        <button disabled={busy || !place.trim()}>{busy ? '…' : '+ Watch'}</button>
      </form>
      {error && <small className="brief-err">{error}</small>}
      <ul>
        {list.map((w) => (
          <li key={w.id}>
            <span>◎ {w.name}</span>
            <small>{w.radiusKm} km</small>
            <button onClick={() => void remove(w.id)} aria-label={`Remove ${w.name}`}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
