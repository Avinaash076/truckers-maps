import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // Prevent Vite from pre-bundling maplibre-gl.
    // When Vite rewrites it, the internal Web Worker URL breaks and
    // you get "Worker failed to load" at runtime.
    exclude: ['maplibre-gl'],
  },
})