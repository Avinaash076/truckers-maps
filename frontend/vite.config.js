import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fix maplibre-gl Web Worker in production Vite builds.
  // Using ES module format for workers is supported in all modern browsers
  // and avoids the "Worker failed to load" error that occurs when Vite
  // inlines the worker blob URL in its default iife format.
  worker: {
    format: 'es',
  },
  server: {
    // Proxy /api/* to the Django backend during local development.
    // In production on Render the frontend and backend are separate services
    // so the API_BASE env var is used instead.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})