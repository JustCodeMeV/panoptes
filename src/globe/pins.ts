import type { GeoPrecision } from '../../shared/feature'

// Pin and cluster billboards drawn to the ATLAS design: square precision markers with a halo
// (catalog: Pins "Halo", Precision marker "Square"), crosshair lock when selected, LCD clusters.

const cache = new Map<string, string>()
const DPR = 2

/** The design's data font, read from the live theme (falls back to a system monospace). */
function monoFont(): string {
  const root = document.querySelector('.atlas')
  return (root && getComputedStyle(root).getPropertyValue('--font-mono').trim()) || 'ui-monospace, monospace'
}

function canvas(px: number) {
  const c = document.createElement('canvas')
  c.width = c.height = px * DPR
  const g = c.getContext('2d')!
  g.scale(DPR, DPR)
  return { c, g }
}

function glyphPath(g: CanvasRenderingContext2D, glyph: string, mid: number, r: number) {
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  if (glyph === 'alert') {
    g.fillRect(mid - r * 0.1, mid - r * 0.55, r * 0.2, r * 0.7)
    g.fillRect(mid - r * 0.1, mid + r * 0.3, r * 0.2, r * 0.2)
  } else if (glyph === 'chart') {
    const bw = r * 0.26
    const base = mid + r * 0.45
    ;[0.4, 0.75, 1.1].forEach((h, i) => g.fillRect(mid - r * 0.55 + i * (bw + r * 0.1), base - r * h * 0.8, bw, r * h * 0.8))
  } else if (glyph === 'pulse') {
    g.beginPath()
    g.moveTo(mid - r * 0.7, mid)
    g.lineTo(mid - r * 0.25, mid)
    g.lineTo(mid - r * 0.05, mid - r * 0.6)
    g.lineTo(mid + r * 0.2, mid + r * 0.55)
    g.lineTo(mid + r * 0.4, mid)
    g.lineTo(mid + r * 0.7, mid)
    g.lineWidth = Math.max(1.4, r * 0.16)
    g.stroke()
  } else if (glyph === 'news') {
    const w = r * 1.0
    g.fillRect(mid - w / 2, mid - r * 0.38, w, r * 0.16)
    g.fillRect(mid - w / 2, mid - r * 0.08, w, r * 0.16)
    g.fillRect(mid - w / 2, mid + r * 0.22, w * 0.62, r * 0.16)
  } else {
    const t = r * 0.45
    g.beginPath()
    g.moveTo(mid - t * 0.55, mid - t)
    g.lineTo(mid + t, mid)
    g.lineTo(mid - t * 0.55, mid + t)
    g.closePath()
    g.fill()
  }
}

/**
 * Square marker in the layer colour, encoding position confidence: solid = exact,
 * framed = approximate, dashed and translucent = inferred. Selected pins get a crosshair lock.
 */
export function pinImage(
  color: string,
  size: number,
  precision: GeoPrecision,
  selected: boolean,
  glyph: 'play' | 'alert' | 'news' | 'chart' | 'pulse' = 'play',
): string {
  const key = `${color}|${size}|${precision}|${selected}|${glyph}`
  const hit = cache.get(key)
  if (hit) return hit

  const pad = selected ? 14 : 8
  const box = size + pad * 2
  const { c, g } = canvas(box)
  const mid = box / 2
  const half = size / 2 - 3

  // Halo
  const halo = g.createRadialGradient(mid, mid, half * 0.6, mid, mid, mid)
  halo.addColorStop(0, color + '66')
  halo.addColorStop(1, color + '00')
  g.fillStyle = halo
  g.fillRect(0, 0, box, box)

  // Square marker
  const inner = precision === 'approximate' ? half * 0.72 : half
  g.fillStyle = precision === 'inferred' ? color + '77' : color
  g.fillRect(mid - inner, mid - inner, inner * 2, inner * 2)
  g.lineWidth = 1.5
  g.strokeStyle = precision === 'inferred' ? color : '#05080c'
  if (precision === 'inferred') g.setLineDash([3, 2])
  g.strokeRect(mid - inner, mid - inner, inner * 2, inner * 2)
  g.setLineDash([])
  if (precision === 'approximate') {
    g.strokeStyle = color
    g.lineWidth = 1.2
    g.strokeRect(mid - half - 1, mid - half - 1, (half + 1) * 2, (half + 1) * 2)
  }
  glyphPath(g, glyph, mid, inner)

  // Crosshair lock
  if (selected) {
    g.strokeStyle = '#ffffff'
    g.lineWidth = 1.5
    const a = half + 4
    const b = mid - 1
    g.beginPath()
    g.moveTo(mid, mid - b)
    g.lineTo(mid, mid - a)
    g.moveTo(mid, mid + a)
    g.lineTo(mid, mid + b)
    g.moveTo(mid - b, mid)
    g.lineTo(mid - a, mid)
    g.moveTo(mid + a, mid)
    g.lineTo(mid + b, mid)
    g.stroke()
    g.lineWidth = 1
    g.strokeRect(mid - a + 1, mid - a + 1, (a - 1) * 2, (a - 1) * 2)
  }

  const url = c.toDataURL()
  cache.set(key, url)
  return url
}

/** LCD readout: black box, phosphor count in the layer colour. */
export function clusterImage(color: string, count: number): string {
  const font = monoFont()
  const key = `cluster|${color}|${count}|${font}`
  const hit = cache.get(key)
  if (hit) return hit
  const label = String(count)
  const w = 18 + label.length * 9
  const h = 22
  const box = Math.max(w, h) + 8
  const { c, g } = canvas(box)
  const x = (box - w) / 2
  const y = (box - h) / 2
  g.fillStyle = '#000'
  g.fillRect(x, y, w, h)
  g.strokeStyle = color + '99'
  g.lineWidth = 1
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  g.font = `500 13px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = color
  g.shadowBlur = 6
  g.fillStyle = color
  g.fillText(label, box / 2, box / 2 + 1)
  const url = c.toDataURL()
  cache.set(key, url)
  return url
}
