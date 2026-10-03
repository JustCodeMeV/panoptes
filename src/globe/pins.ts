import type { GeoPrecision } from '../../shared/feature'

const cache = new Map<string, string>()

/** Pin look encodes position confidence: solid = exact, ringed = approx, dashed = inferred. */
export function pinImage(color: string, size: number, precision: GeoPrecision, selected: boolean): string {
  const key = `${color}|${size}|${precision}|${selected}`
  const hit = cache.get(key)
  if (hit) return hit

  const dpr = 2
  const pad = 6
  const px = (size + pad * 2) * dpr
  const c = document.createElement('canvas')
  c.width = c.height = px
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const mid = size / 2 + pad
  const r = size / 2 - 2

  // glow
  const grad = g.createRadialGradient(mid, mid, r * 0.4, mid, mid, mid)
  grad.addColorStop(0, color + 'aa')
  grad.addColorStop(1, color + '00')
  g.fillStyle = grad
  g.beginPath()
  g.arc(mid, mid, mid, 0, Math.PI * 2)
  g.fill()

  g.beginPath()
  g.arc(mid, mid, r, 0, Math.PI * 2)
  g.fillStyle = precision === 'inferred' ? color + '99' : color
  g.fill()

  g.lineWidth = selected ? 3 : 2
  g.strokeStyle = selected ? '#ffffff' : '#0b0f1a'
  if (precision === 'inferred') g.setLineDash([3, 3])
  g.stroke()
  g.setLineDash([])

  // play glyph
  g.fillStyle = '#fff'
  g.beginPath()
  const t = r * 0.45
  g.moveTo(mid - t * 0.55, mid - t)
  g.lineTo(mid + t, mid)
  g.lineTo(mid - t * 0.55, mid + t)
  g.closePath()
  g.fill()

  const url = c.toDataURL()
  cache.set(key, url)
  return url
}

export function clusterImage(color: string, count: number): string {
  const key = `cluster|${color}|${count}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = count < 10 ? 34 : count < 50 ? 42 : 52
  const dpr = 2
  const c = document.createElement('canvas')
  c.width = c.height = size * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const m = size / 2
  g.fillStyle = color + '55'
  g.beginPath()
  g.arc(m, m, m, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = color
  g.beginPath()
  g.arc(m, m, m - 5, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#0b0f1a'
  g.lineWidth = 2
  g.stroke()
  g.fillStyle = '#fff'
  g.font = 'bold 14px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(count), m, m + 1)
  const url = c.toDataURL()
  cache.set(key, url)
  return url
}
