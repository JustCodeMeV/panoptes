import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadAllFonts } from './fonts'
import './theme.css'
import { Canvas } from './Canvas.tsx'

loadAllFonts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Canvas />
  </StrictMode>,
)
