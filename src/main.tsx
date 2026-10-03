import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../gui_elements/fonts.css'
import './index.css'
import { AtlasTheme } from '../gui_elements/AtlasTheme'
import { Root } from './Root'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AtlasTheme remember className="h-full">
      <Root />
    </AtlasTheme>
  </StrictMode>,
)
