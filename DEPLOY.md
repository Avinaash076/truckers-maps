# Deployment Guide

This project is configured to be easily deployed as a single full-stack web service. The frontend is built using Vite and React, and the backend is powered by Django. During deployment, the frontend is built into static files, which are then served directly by Django using WhiteNoise.

## Deploying to Render.com

Render is a highly recommended platform because it integrates directly with GitHub and supports running our custom build script.

1. **Push your code** to your GitHub repository.
2. Go to **[Render.com](https://render.com/)** and log in or create a free account.
3. Click **New** -> **Web Service** -> **Build and deploy from a Git repository**.
4. Connect your GitHub account and select your repository.
5. In the settings configuration:
    - **Name:** Choose any name for your app (e.g., `spotter-route-shield`).
    - **Environment:** `Python 3`
    - **Build Command:** `./build.sh`
    - **Start Command:** `cd backend && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`
6. Scroll down to **Environment Variables** and add the following keys and values:
    - `PYTHON_VERSION` : `3.12.0`
    - `DEBUG` : `False`
7. Click **Create Web Service**.

Render will automatically execute `build.sh`, which installs both frontend and backend dependencies, builds the Vite application, and collects all static files for Django. Once the build is complete, Render will start the Gunicorn server and your application will be live at a `.onrender.com` URL.

Any future pushes to your GitHub repository will automatically trigger a new build and deployment on Render.
