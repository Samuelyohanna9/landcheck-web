import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/mapbox-gl') || id.includes('node_modules/@mapbox/mapbox-gl-draw')) {
            return 'mapbox-stack'
          }
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
