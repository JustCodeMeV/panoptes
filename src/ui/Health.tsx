import { useEffect, useState } from 'react'
import { Badge } from '../../gui_elements/Badge'

type Row = { layer: string; id: string; ok: boolean; error?: string; off?: boolean; stale?: boolean }

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
  if (!rows)
    return (
      <span title="API unreachable">
        <Badge tone="err">API down</Badge>
      </span>
    )
  const off = rows.filter((r) => r.off)
  const on = rows.filter((r) => !r.off)
  const bad = on.filter((r) => !r.ok)
  const stale = on.filter((r) => r.ok && r.stale)
  const title = [
    ...bad.map((b) => `${b.layer}/${b.id}: ${b.error ?? 'down'}`),
    ...stale.map((b) => `${b.layer}/${b.id}: stale, ${b.error}`),
    ...off.map((b) => `${b.layer}/${b.id}: off (${b.error})`),
  ].join('\n')
  return (
    <span title={title || 'all sources responding'} className={bad.length ? 'cursor-help' : undefined}>
      <Badge tone={bad.length ? 'warn' : 'ok'}>
        {on.length - bad.length}/{on.length} sources
      </Badge>
    </span>
  )
}
