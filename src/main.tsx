import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../gui_elements/fonts.css'
import './index.css'
import { ArgusTheme } from '../gui_elements/ArgusTheme'
import { Root } from './Root'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArgusTheme remember className="h-full">
      <Root />
    </ArgusTheme>
  </StrictMode>,
)
