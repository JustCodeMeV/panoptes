import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const OUT = fileURLToPath(new URL('./gui_elements', import.meta.url))
const ALLOWED = new Set(['design.ts', 'fonts.css'])

// POST /__export {files} writes the chosen design into gui_elements/ (only design.ts and fonts.css).
function exportApi(): Plugin {
  return {
    name: 'canvas-export',
    configureServer(server) {
      server.middlewares.use('/__export', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        for await (const chunk of req) body += chunk
        try {
          const { files } = JSON.parse(body) as { files: Record<string, string> }
          for (const name of Object.keys(files)) if (!ALLOWED.has(name)) throw new Error(`not allowed: ${name}`)
          for (const [name, content] of Object.entries(files)) writeFileSync(join(OUT, name), content)
          res.end(JSON.stringify(Object.keys(files)))
        } catch (e) {
          res.statusCode = 400
          res.end(String(e))
        }
      })
    },
  }
}

// Standalone design canvas: not wired to the app, API or Cesium.
// It renders everything from gui_elements/, so what you pick is exactly what ships.
export default defineConfig({
  root: 'canvas',
  plugins: [react(), tailwindcss(), exportApi()],
  server: { port: 5174 },
})
