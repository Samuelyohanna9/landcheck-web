import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Hashed files are normally safe to cache forever, but an old SPA shell can survive a deploy
// and request a previous asset URL. Include the deployment/build id in every generated asset
// filename so a new deploy cannot reuse a browser or edge-cache entry from an earlier release.
const buildId = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || `local-${Date.now()}`)
  .replace(/[^a-zA-Z0-9_-]/g, '')
  .slice(0, 16)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${buildId}.js`,
        chunkFileNames: `assets/[name]-[hash]-${buildId}.js`,
        assetFileNames: `assets/[name]-[hash]-${buildId}.[ext]`,
        manualChunks(id) {
          if (id.includes('node_modules/@mapbox/mapbox-gl-draw')) return 'mapbox-draw'
          if (id.includes('node_modules/mapbox-gl')) return 'mapbox-gl-core'
          if (id.includes('node_modules/proj4')) return 'proj4'
          if (id.includes('node_modules/xlsx')) return 'xlsx'
          if (id.includes('node_modules/papaparse')) return 'papaparse'
          if (id.includes('node_modules/axios')) return 'http-client'
          if (id.includes('node_modules/react-hot-toast')) return 'toast'
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) {
            return 'react-core'
          }
          return undefined
        },
      },
    },
  },
})
