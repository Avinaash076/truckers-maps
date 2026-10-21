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
