import { createContext, useContext } from 'react'
import type { Viewer } from 'cesium'

export const ViewerContext = createContext<Viewer | null>(null)
export const useViewer = () => useContext(ViewerContext)
