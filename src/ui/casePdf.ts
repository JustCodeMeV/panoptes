import type { CaseFull, CaseItem } from '../core/cases'
import { LAYERS } from '../layers'
import { language } from '../../shared/lang'

// A4 portrait, in mm
const W = 210
const H = 297
const M = 18
const TEXT_W = W - M * 2
const INK: [number, number, number] = [16, 24, 34]
const DIM: [number, number, number] = [96, 112, 128]
const ACCENT: [number, number, number] = [10, 111, 158]

const fmt = (iso?: string) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—')

/** jsPDF's built-in fonts only cover Latin-1: anything else (an untranslated original) is marked, not garbled. */
function latin(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\t\n\r\u0020-\u007e\u00a0-\u00ff]+/g, (m) => (/\p{L}/u.test(m) ? '[non-Latin text]' : ''))
    .trim()
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

/** The one-paragraph gist of a feature: whatever the layer stores as its summary or body. */
function gist(item: CaseItem): string | undefined {
  const p = item.feature.props
  const a = p.assessment as { brief?: { summary?: string } } | undefined
  return str(a?.brief?.summary) ?? str(p.summary) ?? str(p.description) ?? str(p.text)
}

/**
 * Builds the case file as a PDF and downloads it (the browser saves it to Downloads by default):
 * a cover summary (layers, places, sources, time span), then every item with where, when, how
 * sure, its source and the analyst's note.
 */
export async function downloadCasePdf(c: CaseFull): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = M

  const color = (rgb: [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2])
  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage()
      y = M
    }
  }
  const write = (text: string, opts: { size?: number; bold?: boolean; rgb?: [number, number, number]; gap?: number; indent?: number } = {}) => {
    const size = opts.size ?? 10
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    color(opts.rgb ?? INK)
    const lines = doc.splitTextToSize(latin(text), TEXT_W - (opts.indent ?? 0)) as string[]
    const lh = size * 0.42
    for (const line of lines) {
      ensure(lh)
      doc.text(line, M + (opts.indent ?? 0), y + lh * 0.8)
      y += lh
    }
    y += opts.gap ?? 1.5
  }
  const rule = () => {
    ensure(4)
    doc.setDrawColor(210, 218, 226)
    doc.line(M, y + 1, W - M, y + 1)
    y += 4
  }

  // ---- Cover summary ----
  write('ARGUS', { size: 9, bold: true, rgb: ACCENT, gap: 0.5 })
  write('Case file', { size: 9, rgb: DIM, gap: 3 })
  write(c.title, { size: 20, bold: true, gap: 2 })
  write(`Opened ${fmt(c.created)}   ·   Exported ${fmt(new Date().toISOString())}   ·   ${c.items.length} item${c.items.length === 1 ? '' : 's'}`, { size: 9, rgb: DIM, gap: 4 })
  rule()

  const byLayer = new Map<string, number>()
  const sources = new Set<string>()
  const langs = new Set<string>()
  const times: number[] = []
  const prec = { exact: 0, approximate: 0, inferred: 0, none: 0 }
  for (const it of c.items) {
    const f = it.feature
    const label = LAYERS.find((l) => l.id === f.layerId)?.label ?? f.layerId
    byLayer.set(label, (byLayer.get(label) ?? 0) + 1)
    sources.add(f.source.platform)
    if (f.props.original && typeof f.props.lang === 'string') langs.add(language(f.props.lang).name)
    const t = Date.parse(f.observedAt)
    if (!Number.isNaN(t)) times.push(t)
    prec[f.geoPrecision]++
  }
  write('Summary', { size: 12, bold: true, gap: 2 })
  if (times.length) write(`Time span: ${fmt(new Date(Math.min(...times)).toISOString())} to ${fmt(new Date(Math.max(...times)).toISOString())}`)
  write(`Layers: ${[...byLayer].map(([l, n]) => `${l} (${n})`).join(', ') || '—'}`)
  write(`Location confidence: ${prec.exact} exact, ${prec.approximate} approximate, ${prec.inferred} inferred from text, ${prec.none} unplaced`)
  write(`Sources: ${[...sources].join(', ') || '—'}`)
  if (langs.size) write(`Machine-translated from: ${[...langs].join(', ')} (originals kept in the case data)`)
  y += 2
  rule()

  // ---- Items ----
  c.items.forEach((it, i) => {
    const f = it.feature
    const def = LAYERS.find((l) => l.id === f.layerId)
    ensure(24)
    write(`${String(i + 1).padStart(2, '0')}   ${def?.label ?? f.layerId}`.toUpperCase(), { size: 8, bold: true, rgb: ACCENT, gap: 1 })
    write(f.title, { size: 12, bold: true, gap: 2 })
    const where = f.position ? `${f.position.lat.toFixed(4)}, ${f.position.lon.toFixed(4)} (${f.geoPrecision})` : 'No location'
    write(`Observed ${fmt(f.observedAt)}   ·   Saved ${fmt(it.added)}`, { size: 9, rgb: DIM, gap: 0.5 })
    write(`Location: ${where}${f.geoBasis ? `. ${f.geoBasis}` : ''}`, { size: 9, rgb: DIM, gap: 0.5 })
    write(`Source: ${f.source.platform}${f.source.url ? `  ${f.source.url}` : ''}`, { size: 9, rgb: DIM, gap: 0.5 })
    const verdict = str(f.props.verdict) ?? str((f.props.assessment as { verdict?: string } | undefined)?.verdict)
    if (verdict) write(`Verdict: ${verdict}`, { size: 9, bold: true, gap: 0.5 })
    if (f.props.original && typeof f.props.lang === 'string') write(`Original in ${language(f.props.lang).name}, machine-translated`, { size: 9, rgb: DIM, gap: 0.5 })
    const g = gist(it)
    if (g) {
      y += 1.5
      write(g.length > 900 ? `${g.slice(0, 900)}...` : g, { size: 10, gap: 1 })
    }
    if (it.note.trim()) {
      y += 1
      write('Analyst note', { size: 8, bold: true, rgb: DIM, gap: 0.5 })
      write(it.note, { size: 10, indent: 3, gap: 1 })
    }
    y += 2
    rule()
  })
  if (!c.items.length) write('This case has no items yet. Use "Add to case" on any story to collect evidence.', { rgb: DIM })

  // ---- Page footers ----
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    color(DIM)
    doc.text(latin(`Argus · ${c.title}`), M, H - 8)
    doc.text(`${p} / ${pages}`, W - M, H - 8, { align: 'right' })
  }

  const slug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'case'
  doc.save(`argus-case-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
