import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Fix: Inline the MapLibre GL web worker as a blob URL so Render's
// SPA rewrite rule (404 → index.html) never intercepts the worker file.
// Without this, the browser fetches the worker JS, gets HTML back,
// and throws "non-JavaScript MIME type" → blank map.
import maplibregl from 'maplibre-gl'
import MaplibreWorker from 'maplibre-gl/dist/maplibre-gl-csp-worker?worker&inline'
maplibregl.workerClass = MaplibreWorker

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

