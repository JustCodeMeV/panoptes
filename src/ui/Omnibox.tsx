import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from '../../gui_elements/Controls'
import type { Feature } from '../../shared/feature'
import { featuresOf, useStore } from '../core/store'
import { flyTo, useInvestigation } from '../core/investigation'
import { LAYERS } from '../layers'
import { matchesQuery } from '../core/search'

type Place = { name: string; lat: number; lon: number; kind: string; country?: string }
type Ent = { id: string; type: string; subtype?: string; label: string }
type Row = { key: string; group: string; label: string; sub: string; color?: string; go: () => void }

/**
 * The search box: filters the layer lists as before, and drops down one list of everything that matches:
 * countries (open the atlas), places (fly there), investigation entities (open the canvas) and live items
 * across all loaded layers (select). Places and entities come from one small server query, debounced;
 * live items are searched in the browser, so typing costs the server nothing.
 */
export function Omnibox({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const layers = useStore((s) => s.layers)
  const select = useStore((s) => s.select)
  const seedEntity = useInvestigation((s) => s.seedEntity)
  const [remote, setRemote] = useState<{ q: string; places: Place[]; entities: Ent[] }>({ q: '', places: [], entities: [] })
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()

  useEffect(() => {
    if (q.length < 2) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setRemote({ q, places: j.places ?? [], entities: j.entities ?? [] }))
        .catch(() => {})
    }, 220)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [q])

  const rows = useMemo<Row[]>(() => {
    if (q.length < 2) return []
    const out: Row[] = []
    const fresh = remote.q === q
    const done = () => {
      setOpen(false)
      setQuery('')
    }
    if (fresh)
      for (const p of remote.places) {
        const country = p.kind === 'country'
        out.push({
          key: `p:${p.name}`,
          group: country ? 'Countries' : 'Places',
          label: p.name,
          sub: country ? 'open the atlas' : [p.kind, p.country].filter(Boolean).join(' · '),
          go: () => {
            if (country) void import('../core/atlas').then((m) => m.openCountry(p.name, { lat: p.lat, lon: p.lon }))
            else flyTo(p.lat, p.lon)
            done()
          },
        })
      }
    const items: { f: Feature; color: string; label: string; score: number }[] = []
    for (const def of LAYERS) {
      const st = layers[def.id]
      if (!st?.enabled || def.hidden) continue
      for (const f of featuresOf(st)) {
        if (!matchesQuery(f, q)) continue
        const t = f.title.toLowerCase()
        items.push({ f, color: def.pin(f).color ?? def.color, label: def.label, score: (t.startsWith(q) ? 3 : t.includes(q) ? 2 : 1) + (Date.parse(f.observedAt) || 0) / 1e14 })
      }
    }
    items.sort((a, b) => b.score - a.score)
    for (const { f, color, label } of items.slice(0, 8))
      out.push({ key: `f:${f.id}`, group: 'On the map', label: f.title, sub: label, color, go: () => (select(f.id), done()) })
    if (fresh)
      for (const e of remote.entities)
        out.push({ key: `e:${e.id}`, group: 'Investigation', label: e.label, sub: [e.type, e.subtype].filter(Boolean).join(' · '), go: () => (void seedEntity(e.id), done()) })
    return out
  }, [q, remote, layers, select, seedEntity, setQuery])

  // ⌘K / Ctrl+K focuses the search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      box.current?.querySelector('input')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false)
    if (!rows.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length)
    } else if (e.key === 'Enter') rows[Math.min(hi, rows.length - 1)]?.go()
  }

  return (
    <div ref={box} className="relative" onKeyDown={onKey} onFocus={() => setOpen(true)}>
      <Search
        value={query}
        onChange={(v) => {
          setQuery(v)
          setOpen(true)
          setHi(0)
        }}
        placeholder="Country, place, person, story…"
        label="Search"
      />
      {open && rows.length > 0 && (
        <div role="listbox" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-[60vh] overflow-y-auto border border-line bg-panel p-1 shadow-lg">
          {rows.map((r, i) => (
            <div key={r.key}>
              {(i === 0 || rows[i - 1].group !== r.group) && <div className="sub t-caption px-2 pt-1.5 pb-0.5 text-dim uppercase">{r.group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={i === hi}
                onPointerEnter={() => setHi(i)}
                onClick={r.go}
                className={`flex w-full items-baseline gap-2 px-2 py-1 text-left ${i === hi ? 'bg-accent-2/15' : ''}`}
              >
                {r.color && <span className="inline-block size-2 flex-none translate-y-[-1px] rounded-full" style={{ background: r.color }} />}
                <span className="flex min-w-0 flex-auto flex-col">
                  <span className="truncate">{r.label}</span>
                  <span className="sub t-caption truncate text-dim">{r.sub}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
