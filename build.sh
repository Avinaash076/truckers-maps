#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "Installing backend dependencies..."
cd backend
pip install -r requirements.txt

echo "Collecting static files..."
python manage.py collectstatic --no-input
cd ..

echo "Build complete."
