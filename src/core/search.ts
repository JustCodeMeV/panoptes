import type { Feature } from '../../shared/feature'

// Text an item is searchable by: title plus the props people type (place, channel, source, actor).
const hay = new WeakMap<Feature, string>()
const textOf = (f: Feature) => {
  let s = hay.get(f)
  if (s === undefined) {
    const p = f.props
    s = [f.title, p.text, p.country, p.place, p.channel, p.handle, p.source, p.group, p.victim, p.malware, p.name, f.source.provider]
      .filter((v) => typeof v === 'string')
      .join(' ')
      .toLowerCase()
    hay.set(f, s)
  }
  return s
}
/** Every word of the query appears in the item (any order). */
export const matchesQuery = (f: Feature, q: string) => !q || q.split(/\s+/).every((w) => textOf(f).includes(w))
