import { useEffect, useState } from 'react'

type Row = { layer: string; id: string; ok: boolean; error?: string }

/** Is every data source alive? A dead feed should be obvious BEFORE you present. */
export function Health() {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/health/sources')
        .then((r) => r.json())
        .then((d: Row[]) => alive && setRows(d))
        .catch(() => alive && setRows(null))
    void load()
    const t = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  if (!rows) return <span className="health bad" title="API unreachable">● API down</span>
  const bad = rows.filter((r) => !r.ok)
  return (
    <span className={`health ${bad.length ? 'warn' : 'ok'}`} title={bad.map((b) => `${b.layer}/${b.id}: ${b.error ?? 'down'}`).join('\n') || 'all sources responding'}>
      ● {rows.length - bad.length}/{rows.length} sources
    </span>
  )
}
