import { useState, type CSSProperties, type ReactNode } from 'react'
import { designClasses, designVars, type Design } from './catalog'
import { ControlsContext, DesignContext, type AtlasControls } from './context'
import { DESIGN } from './design'

// Per-viewer preferences; storage can be unavailable (private mode), so every access is guarded.
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

type Props = {
  design?: Design
  /** Remember the viewer's colour scheme and satellite choice between visits. */
  remember?: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/**
 * Applies an ATLAS design to everything inside it: fonts, colours, surface and glow as CSS variables,
 * and the chosen variant of every component. Wrap the app once: <AtlasTheme remember>…</AtlasTheme>.
 */
export function AtlasTheme({ design = DESIGN, remember = false, className = '', style, children }: Props) {
  const [override, setOverride] = useState<number | null>(() => {
    const v = remember ? read('atlas-colour') : null
    return v === null ? null : Number(v)
  })
  const [satellite, setSat] = useState(() => remember && read('atlas-satellite') === '1')
  // A new design colour (e.g. picked in the design editor) wins over a runtime switch
  const [baseColour, setBaseColour] = useState(design.colour)
  if (design.colour !== baseColour) {
    setBaseColour(design.colour)
    setOverride(null)
  }

  const active = override === null ? design : { ...design, colour: override }
  const controls: AtlasControls = {
    colour: active.colour,
    setColour: (i) => {
      setOverride(i)
      if (remember) write('atlas-colour', String(i))
    },
    satellite,
    setSatellite: (on) => {
      setSat(on)
      if (remember) write('atlas-satellite', on ? '1' : null)
    },
  }

  return (
    <DesignContext.Provider value={active}>
      <ControlsContext.Provider value={controls}>
        <div className={`atlas font-main text-ink ${designClasses(active)} ${className}`} style={{ ...designVars(active), ...style }}>
          {children}
        </div>
      </ControlsContext.Provider>
    </DesignContext.Provider>
  )
}
