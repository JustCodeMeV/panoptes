import { useEffect, useState } from 'react'

type Stats = {
  scouts: number
  curated: number
  discovered: { handle: string; name: string; refs: number }[]
  failing: number
  requestsPerMin: number
  posts: number
  clusters: number
  busiest: { handle: string; perHour: number; everySec: number }[]
}

/** What the scout swarm is doing right now: size, load, discoveries. */
export function SwarmControls() {
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/telegram/swarm')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && j && setS(j))
        .catch(() => {})
    void load()
    const t = setInterval(load, 15_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  if (!s) return null
  return (
    <div className="tg-swarm">
      <p>
        <b>{s.scouts}</b> scouts ({s.curated} curated, {s.discovered.length} discovered) · <b>{s.requestsPerMin}</b> req/min · <b>{s.posts}</b> posts
        {s.clusters ? (
          <>
            {' '}
            · <b className="alert">{s.clusters}</b> coordinated
          </>
        ) : null}
        {s.failing ? ` · ${s.failing} failing` : ''}
      </p>
      {s.discovered.length > 0 && (
        <p className="tg-found">
          Found via forwards:{' '}
          {s.discovered.map((d) => (
            <a key={d.handle} href={`https://t.me/s/${d.handle}`} target="_blank" rel="noreferrer" title={d.name}>
              @{d.handle}
            </a>
          ))}
        </p>
      )}
    </div>
  )
}
