# Hosting Environment Requirements

To host this application successfully (e.g. on Render, Heroku, AWS, or DigitalOcean), ensure the following configurations are met.

## 1. Web Server MIME Types
The frontend utilizes modern ECMAScript modules (`.mjs`). MapLibre-GL specifically requires its web worker to be loaded via a `.mjs` or `.js` file with an `application/javascript` MIME type.
If your hosting provider or web server (e.g., Nginx, WhiteNoise, Apache, Cloudflare) enforces strict MIME checking, **you must ensure that `.mjs` extensions map to `application/javascript`**.

If you use Django + WhiteNoise (like this project currently does), this is solved by explicitly registering the MIME type in `backend/config/settings.py`:
\`\`\`python
import mimetypes
mimetypes.add_type("application/javascript", ".mjs")
\`\`\`

## 2. API Proxying & Routing
The frontend routes any requests matching `/api/` to the backend. In local development, Vite proxies this automatically. In production, Django intercepts `/api/` via its `urls.py`.

Any unhandled routes are directed to `TemplateView(template_name='index.html')` to allow React Router to handle them. Make sure that paths intended for static assets (like `/assets/*`) are served directly and NOT intercepted by the `TemplateView`. In this project, this is handled via a Regex lookup in `urls.py`:
\`\`\`python
re_path(r'^(?!api/|assets/).*', TemplateView.as_view(template_name='index.html'))
\`\`\`

## 3. Environment Variables
Ensure the following variables are defined in your hosting provider's dashboard:
- `PYTHON_VERSION`: `3.12.0` (or similar modern version)
- `DEBUG`: `False`

## 4. Build Process
The hosting platform must be able to run the provided `build.sh` script, which installs frontend packages, builds the Vite production assets, copies necessary worker scripts, installs backend requirements, and collects static files into a single directory.
