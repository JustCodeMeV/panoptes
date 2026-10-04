import { createContext, useContext } from 'react'
import type { Design } from './catalog'
import { DESIGN } from './design'

export const DesignContext = createContext<Design>(DESIGN)

/** The active design; components use it to pick their variant. */
export const useDesign = () => useContext(DesignContext)

export type ArgusControls = {
  /** Active colour scheme (index into catalog.COLOURS). Users can switch it from inside the app. */
  colour: number
  setColour: (i: number) => void
  /** Globe shows satellite imagery instead of the design's globe style. */
  satellite: boolean
  setSatellite: (on: boolean) => void
}

export const ControlsContext = createContext<ArgusControls>({ colour: DESIGN.colour, setColour: () => {}, satellite: false, setSatellite: () => {} })

/** Runtime view controls (colour scheme, satellite view) shared by the whole interface. */
export const useArgusControls = () => useContext(ControlsContext)
