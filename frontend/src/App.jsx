import React, { useState, useRef } from 'react';
import Map, { Marker, Source, Layer, NavigationControl, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Truck, MapPin, Calendar, Weight, Navigation,
  AlertTriangle, CheckCircle, XCircle, Wind, CloudRain,
  CloudSnow, Clock, Route, BarChart3, Loader2
} from 'lucide-react';
import AutocompleteInput from './AutocompleteInput';

const RISK_COLORS = {
  'Clear':     '#22c55e',
  'Low':       '#84cc16',
  'Moderate':  '#eab308',
  'High':      '#f97316',
  'Severe':    '#ef4444',
  'No Travel': '#7c3aed',
};

const ROUTE_COLORS = ['#2dd4bf', '#60a5fa', '#f472b6'];

const RISK_ICON = {
  'Clear':     { icon: CheckCircle,   cls: 'text-green-400'   },
  'Low':       { icon: CheckCircle,   cls: 'text-lime-400'    },
  'Moderate':  { icon: AlertTriangle, cls: 'text-yellow-400'  },
  'High':      { icon: AlertTriangle, cls: 'text-orange-400'  },
  'Severe':    { icon: XCircle,       cls: 'text-red-400'     },
  'No Travel': { icon: XCircle,       cls: 'text-purple-400'  },
};

function RiskBadge({ level }) {
  const color = RISK_COLORS[level] || '#94a3b8';
  return (
    <span style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
      className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">
      {level}
    </span>
  );
}

function RouteCard({ route, idx, selected, onSelect }) {
  const s = route.summary;
  const worstCps = route.checkpoints
    .filter(c => c.risk === 'No Travel' || c.risk === 'Severe')
    .length;
  return (
    <button
      onClick={() => onSelect(idx)}
      className={`w-full text-left rounded-xl border p-3 transition-all ${
        selected
          ? 'border-teal-400 bg-teal-500/10 shadow-lg shadow-teal-500/10'
          : 'border-slate-700 bg-slate-950 hover:border-slate-500'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ROUTE_COLORS[idx] }} />
          <span className="font-bold text-sm text-white">{route.label}</span>
        </div>
        <RiskBadge level={s.no_travel_miles > 0 ? 'No Travel' : s.severe_miles > 0 ? 'Severe' : s.high_miles > 0 ? 'High' : 'Clear'} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span><Clock className="inline w-3 h-3 mr-1" />{Math.round(route.duration_seconds / 60)} min</span>
        <span><Route className="inline w-3 h-3 mr-1" />{route.distance_miles} mi</span>
        <span className="text-red-400">🚫 No Travel: {s.no_travel_miles} pts</span>
        <span className="text-orange-400">⚠️ Severe: {s.severe_miles} pts</span>
      </div>
    </button>
  );
}

export default function App() {
  const [formData, setFormData] = useState({
    origin: 'Chicago, IL',
    destination: 'Denver, CO',
    departureTime: new Date().toISOString().slice(0, 16),
    loadWeight: 42000,
    intervalMiles: 50,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [popupInfo, setPopupInfo] = useState(null);
  const mapRef = useRef(null);

  const getLoadWarning = (weight) => {
    if (weight > 40000) return 'Heavy Load (>40k lb): Wind 35–44 mph = SEVERE | 45–54 mph = NO TRAVEL';
    if (weight > 30000) return 'Medium-Heavy (>30k lb): Wind 45–54 mph upgraded to NO TRAVEL';
    return 'Standard Load (≤30k lb): Standard thresholds apply (≥55 mph = No Travel)';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setPopupInfo(null);
    try {
      const resp = await fetch('/api/routes/analyze/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: formData.origin,
          destination: formData.destination,
          departure_time: formData.departureTime,
          load_weight: formData.loadWeight,
          interval_miles: formData.intervalMiles,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setResult(data);
      setSelectedRoute(0);
      // Fly to fit both endpoints
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [
            (data.origin.lon + data.destination.lon) / 2,
            (data.origin.lat + data.destination.lat) / 2,
          ],
          zoom: 5,
          duration: 1500,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Build GeoJSON for route line + checkpoint markers
  const activeRoute = result?.routes?.[selectedRoute];

  const routeLineGeoJSON = activeRoute
    ? {
        type: 'FeatureCollection',
        features: result.routes.map((r, i) => ({
          type: 'Feature',
          properties: { routeIdx: i, selected: i === selectedRoute },
          geometry: r.geometry,
        })),
      }
    : null;

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row overflow-hidden">
      {/* ── LEFT PANEL ── */}
      <aside className="w-full md:w-[400px] bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden z-10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-800 p-4 shrink-0">
          <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight">Spotter Route Shield</h1>
            <p className="text-xs text-slate-400">Weather-Aware Truck Routing</p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Origin */}
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-teal-400" /> Origin
              </label>
              <AutocompleteInput
                value={formData.origin}
                onChange={(val) => setFormData({ ...formData, origin: val })}
                placeholder="e.g., Chicago, IL"
                required={true}
              />
            </div>

            {/* Destination */}
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                <Navigation className="w-3.5 h-3.5 text-sky-400" /> Destination
              </label>
              <AutocompleteInput
                value={formData.destination}
                onChange={(val) => setFormData({ ...formData, destination: val })}
                placeholder="e.g., Denver, CO"
                required={true}
              />
            </div>

            {/* Departure time */}
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-teal-400" /> Departure Date & Time
              </label>
              <input
                type="datetime-local"
                value={formData.departureTime}
                onChange={(e) => setFormData({ ...formData, departureTime: e.target.value })}
                required
                className="w-full bg-slate-950 border border-slate-700 focus:border-teal-400 rounded-lg px-3 py-2 text-sm text-white outline-none transition"
              />
            </div>

            {/* Load weight */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-300 uppercase flex items-center gap-1.5">
                  <Weight className="w-3.5 h-3.5 text-amber-400" /> Load Weight (lbs)
                </label>
                <input
                  type="number"
                  value={formData.loadWeight}
                  onChange={(e) => setFormData({ ...formData, loadWeight: Number(e.target.value) })}
                  className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-sm font-bold text-teal-300"
                />
              </div>
              <input
                type="range" min="10000" max="60000" step="1000"
                value={formData.loadWeight}
                onChange={(e) => setFormData({ ...formData, loadWeight: Number(e.target.value) })}
                className="w-full accent-teal-400 cursor-pointer my-1"
              />
              <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded p-2 mt-1 flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>{getLoadWarning(formData.loadWeight)}</span>
              </div>
            </div>

            {/* Interval */}
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Weather Checkpoint Interval
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[10, 25, 50].map((miles) => (
                  <button
                    type="button"
                    key={miles}
                    onClick={() => setFormData({ ...formData, intervalMiles: miles })}
                    className={`py-2 rounded-lg text-xs font-bold border transition ${
                      formData.intervalMiles === miles
                        ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-lg'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    Every {miles} mi
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:bg-teal-800 text-slate-950 font-extrabold text-sm tracking-wide transition shadow-lg flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Analyzing Corridor Weather...' : 'Find Safest Truck Route'}
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg p-3 flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </form>

          {/* ROUTE RESULTS */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
                <BarChart3 className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-bold uppercase text-slate-300 tracking-wider">Route Analysis</span>
              </div>
              {result.routes.map((route, idx) => (
                <RouteCard
                  key={idx}
                  route={route}
                  idx={idx}
                  selected={selectedRoute === idx}
                  onSelect={setSelectedRoute}
                />
              ))}

              {/* Risk Legend */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Risk Legend</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(RISK_COLORS).map(([level, color]) => (
                    <div key={level} className="flex items-center gap-1.5 text-[11px]">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-slate-300">{level}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── RIGHT PANEL: MAP ── */}
      <main className="flex-1 relative">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: -96.5, latitude: 40.5, zoom: 4.3 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          onClick={() => setPopupInfo(null)}
        >
          <NavigationControl position="top-right" />

          {/* Route polylines */}
          {routeLineGeoJSON && (
            <Source id="routes" type="geojson" data={routeLineGeoJSON}>
              {/* Unselected routes */}
              <Layer
                id="routes-inactive"
                type="line"
                filter={['!', ['get', 'selected']]}
                paint={{
                  'line-color': ['case',
                    ['==', ['get', 'routeIdx'], 0], ROUTE_COLORS[0],
                    ['==', ['get', 'routeIdx'], 1], ROUTE_COLORS[1],
                    ROUTE_COLORS[2]
                  ],
                  'line-width': 3,
                  'line-opacity': 0.35,
                  'line-dasharray': [4, 3],
                }}
              />
              {/* Selected route */}
              <Layer
                id="routes-active"
                type="line"
                filter={['get', 'selected']}
                paint={{
                  'line-color': ROUTE_COLORS[selectedRoute] || ROUTE_COLORS[0],
                  'line-width': 6,
                  'line-opacity': 0.9,
                }}
              />
            </Source>
          )}

          {/* Checkpoint markers for active route */}
          {activeRoute?.checkpoints?.map((cp, i) => {
            const color = RISK_COLORS[cp.risk] || '#94a3b8';
            return (
              <Marker
                key={i}
                longitude={cp.lon}
                latitude={cp.lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setPopupInfo(cp);
                }}
              >
                <div
                  title={`Mile ${cp.mile}: ${cp.risk}`}
                  style={{
                    width: 12, height: 12,
                    borderRadius: '50%',
                    backgroundColor: color,
                    border: '2px solid #0f172a',
                    cursor: 'pointer',
                    boxShadow: `0 0 6px ${color}88`,
                  }}
                />
              </Marker>
            );
          })}

          {/* Origin / Dest markers */}
          {result && (
            <>
              <Marker longitude={result.origin.lon} latitude={result.origin.lat} anchor="bottom">
                <div className="flex flex-col items-center">
                  <div className="bg-teal-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                    START
                  </div>
                  <div className="w-0.5 h-2 bg-teal-500" />
                  <div className="w-2 h-2 rounded-full bg-teal-400" />
                </div>
              </Marker>
              <Marker longitude={result.destination.lon} latitude={result.destination.lat} anchor="bottom">
                <div className="flex flex-col items-center">
                  <div className="bg-sky-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                    END
                  </div>
                  <div className="w-0.5 h-2 bg-sky-500" />
                  <div className="w-2 h-2 rounded-full bg-sky-400" />
                </div>
              </Marker>
            </>
          )}

          {/* Checkpoint popup */}
          {popupInfo && (
            <Popup
              longitude={popupInfo.lon}
              latitude={popupInfo.lat}
              anchor="bottom"
              onClose={() => setPopupInfo(null)}
              closeButton
              closeOnClick={false}
            >
              <div className="bg-slate-900 text-slate-100 rounded-lg p-3 min-w-[180px] text-xs space-y-1.5">
                <div className="font-bold text-sm flex items-center gap-2">
                  Mile {popupInfo.mile}
                  <RiskBadge level={popupInfo.risk} />
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Clock className="w-3 h-3" />
                  ETA: {new Date(popupInfo.eta_iso).toLocaleString()}
                </div>
                <div className="flex items-center gap-1.5 text-sky-300">
                  <Wind className="w-3 h-3" />
                  Wind: {popupInfo.wind_mph?.toFixed(1)} mph
                </div>
                <div className="flex items-center gap-1.5 text-blue-300">
                  <CloudRain className="w-3 h-3" />
                  Rain: {popupInfo.rain_in?.toFixed(2)}"
                </div>
                <div className="flex items-center gap-1.5 text-indigo-300">
                  <CloudSnow className="w-3 h-3" />
                  Snow: {popupInfo.snowfall_in?.toFixed(2)}"
                </div>
              </div>
            </Popup>
          )}
        </Map>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-4 z-20">
            <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
            <div className="text-center">
              <p className="font-bold text-white">Analyzing Route Corridor</p>
              <p className="text-slate-400 text-sm mt-1">Fetching weather at each checkpoint…</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}