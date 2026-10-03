import { useDesign } from './context'
import { ICON_GLYPHS, ICON_PATHS, type IconName } from './icons'

/** Icon in the design's icon style. Sized by font-size (1em). */
export function Icon({ name, className = '', title }: { name: IconName; className?: string; title?: string }) {
  if (useDesign().iconStyle === 8)
    return <span className={`glyph ${className}`} aria-hidden={!title} title={title}>{ICON_GLYPHS[name]}</span>
  return (
    <svg viewBox="0 0 16 16" className={`ico ${className}`} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {ICON_PATHS[name]}
    </svg>
  )
}
