import { useEffect, useState } from 'react'

/** Re-renders the caller every `ms`, so relative times ("12s ago") keep ticking. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function ago(from: number | string | undefined, now: number): string {
  if (from === undefined) return ''
  const t = typeof from === 'string' ? new Date(from).getTime() : from
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
