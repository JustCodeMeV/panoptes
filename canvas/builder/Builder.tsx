import { useEffect, useState } from 'react'
import { ArgusTheme } from '../../gui_elements/ArgusTheme'
import { CATEGORIES, type Category } from '../../gui_elements/catalog'
import { exportFiles } from './exportDesign'
import { FullMock } from './FullMock'
import { Sample } from './Samples'
import { PAGES, PER_PAGE, useEditor } from './store'

const chrome = {
  btn: 'cursor-pointer rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-[#c9cfdb] transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white active:scale-[0.97] disabled:cursor-default disabled:opacity-40',
  dim: 'text-[#6b7385]',
}

function pageLabel(page: number) {
  const cats = CATEGORIES.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  return [...new Set(cats.map((c) => c.section))].join(' · ')
}

function Row({ cat }: { cat: (typeof CATEGORIES)[number] }) {
  const key = cat.key as Category
  const value = useEditor((s) => s.design[key])
  const set = useEditor((s) => s.set)
  const n = cat.options.length
  const step = (dir: number) => set(key, (value + dir + n) % n)
  return (
    <div className="flex items-stretch gap-3 border-t border-white/[0.06] px-3 py-3 first:border-t-0">
      <div className="min-w-0 flex-1 self-center">
        <Sample cat={key} />
      </div>
      <div className="flex w-[148px] flex-none flex-col gap-1">
        <span className={`text-[10px] tracking-[0.12em] uppercase ${chrome.dim}`}>{cat.label}</span>
        <select
          value={value}
          onChange={(e) => set(key, Number(e.target.value))}
          className="h-8 w-full cursor-pointer rounded-md border border-white/10 bg-[#0d1119] px-2 text-xs text-white hover:border-white/25 focus:border-[#7fd1ff]/70 focus:outline-none"
          aria-label={cat.label}
        >
          {cat.options.map((o, i) => (
            <option key={o} value={i}>{String(i + 1).padStart(2, '0')} · {o}</option>
          ))}
        </select>
        <div className="flex gap-1">
          <button type="button" className={`${chrome.btn} flex-1 !py-0.5`} onClick={() => step(-1)} aria-label="Previous option">‹</button>
          <button type="button" className={`${chrome.btn} flex-1 !py-0.5`} onClick={() => step(1)} aria-label="Next option">›</button>
        </div>
      </div>
    </div>
  )
}

export function Builder() {
  const design = useEditor((s) => s.design)
  const page = useEditor((s) => s.page)
  const setPage = useEditor((s) => s.setPage)
  const reset = useEditor((s) => s.reset)
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [editorOpen, setEditorOpen] = useState(true)
  const cats = CATEGORIES.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)

  // ← / → page through categories when not typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, select, textarea, [role=slider]')) return
      if (e.key === 'ArrowRight') setPage(page + 1)
      if (e.key === 'ArrowLeft') setPage(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, setPage])

  const doExport = async () => {
    if (!confirm('Export this design into gui_elements/ (design.ts + fonts.css)? This replaces the current design.')) return
    setStatus('busy')
    try {
      const r = await fetch('/__export', { method: 'POST', body: JSON.stringify({ files: exportFiles(design) }) })
      if (!r.ok) throw new Error(await r.text())
      setStatus('done')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (e) {
      console.error(e)
      setStatus('error')
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Editor */}
      <aside className={`flex flex-none flex-col overflow-hidden border-r border-white/[0.08] bg-[#070a12] transition-[width] duration-300 ${editorOpen ? 'w-[480px]' : 'w-0 border-r-0'}`}>
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <span className={`flex-1 text-[11px] ${chrome.dim}`}>{CATEGORIES.length} parts · ← → to page</span>
          <button type="button" className={chrome.btn} onClick={() => confirm('Reset to the exported design?') && reset()}>Reset</button>
          <button type="button" className={chrome.btn} onClick={doExport} disabled={status === 'busy'}>
            {status === 'done' ? '✓ Exported' : status === 'error' ? 'Export failed' : 'Export to gui_elements'}
          </button>
        </div>
        <ArgusTheme design={design} className="min-h-0 flex-1 overflow-y-auto bg-bg">
          {cats.map((c) => <Row key={c.key} cat={c} />)}
        </ArgusTheme>
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2.5">
          <button type="button" className={chrome.btn} onClick={() => setPage(page - 1)}>‹ Prev 6</button>
          <span className="flex-1 truncate text-center text-[11px] text-[#c9cfdb]">
            <span className="font-mono text-[#7fd1ff]">{page + 1}/{PAGES}</span> <span className={chrome.dim}>{pageLabel(page)}</span>
          </span>
          <button type="button" className={chrome.btn} onClick={() => setPage(page + 1)}>Next 6 ›</button>
        </div>
      </aside>

      {/* Live GUI */}
      <main className="relative min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setEditorOpen(!editorOpen)}
          className="absolute top-1/2 left-0 z-40 -translate-y-1/2 cursor-pointer rounded-r-md border border-l-0 border-white/15 bg-[#0d1119] px-1 py-3 text-[11px] text-[#c9cfdb] [writing-mode:vertical-rl] hover:text-white"
          title={editorOpen ? 'Hide the editor to see the full-width screen' : 'Show the editor'}
        >
          {editorOpen ? '‹ hide editor' : 'editor ›'}
        </button>
        <ArgusTheme design={design} className="h-full">
          <FullMock />
        </ArgusTheme>
      </main>
    </div>
  )
}
