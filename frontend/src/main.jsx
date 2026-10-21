import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as maplibregl from 'maplibre-gl'
import MaplibreWorker from 'maplibre-gl/dist/maplibre-gl-csp-worker?worker&inline'
import './index.css'
import App from './App.jsx'

maplibregl.workerClass = MaplibreWorker

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
