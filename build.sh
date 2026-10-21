#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Building frontend..."
cd frontend
npm install
npm run build
# Explicitly copy the maplibre worker so WhiteNoise can serve it with correct mime type
# We copy it as .js to ensure python mimetypes serves it as application/javascript
cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs dist/assets/maplibre-gl-worker.js
cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs dist/assets/maplibre-gl-worker.mjs
cd ..

echo "Installing backend dependencies..."
cd backend
pip install -r requirements.txt

echo "Collecting static files..."
python manage.py collectstatic --no-input
cd ..

echo "Build complete."
