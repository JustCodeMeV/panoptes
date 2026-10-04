import { useState, type CSSProperties, type ReactNode } from 'react'
import { designClasses, designVars, type Design } from './catalog'
import { ControlsContext, DesignContext, type ArgusControls } from './context'
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
 * Applies an ARGUS design to everything inside it: fonts, colours, surface and glow as CSS variables,
 * and the chosen variant of every component. Wrap the app once: <ArgusTheme remember>…</ArgusTheme>.
 */
export function ArgusTheme({ design = DESIGN, remember = false, className = '', style, children }: Props) {
  const [override, setOverride] = useState<number | null>(() => {
    const v = remember ? read('argus-colour') : null
    return v === null ? null : Number(v)
  })
  const [satellite, setSat] = useState(() => remember && read('argus-satellite') === '1')
  // A new design colour (e.g. picked in the design editor) wins over a runtime switch
  const [baseColour, setBaseColour] = useState(design.colour)
  if (design.colour !== baseColour) {
    setBaseColour(design.colour)
    setOverride(null)
  }

  const active = override === null ? design : { ...design, colour: override }
  const controls: ArgusControls = {
    colour: active.colour,
    setColour: (i) => {
      setOverride(i)
      if (remember) write('argus-colour', String(i))
    },
    satellite,
    setSatellite: (on) => {
      setSat(on)
      if (remember) write('argus-satellite', on ? '1' : null)
    },
  }

  return (
    <DesignContext.Provider value={active}>
      <ControlsContext.Provider value={controls}>
        <div className={`argus font-main text-ink ${designClasses(active)} ${className}`} style={{ ...designVars(active), ...style }}>
          {children}
        </div>
      </ControlsContext.Provider>
    </DesignContext.Provider>
  )
}
