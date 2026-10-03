import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumSource = 'node_modules/cesium/Build/Cesium'

// https://vite.dev/config/
export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers`, dest: 'cesium', rename: { stripBase: 4 } },
        { src: `${cesiumSource}/ThirdParty`, dest: 'cesium', rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Assets`, dest: 'cesium', rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Widgets`, dest: 'cesium', rename: { stripBase: 4 } },
      ],
    }),
  ],
})
