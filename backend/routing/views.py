import math
import requests
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

# ─────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
USER_AGENT = "SpotterRouteShield/1.0 (truck-routing-app)"

EARTH_RADIUS_MI = 3958.8


def haversine_miles(lon1, lat1, lon2, lat2):
    """Return distance in miles between two (lon, lat) points."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(a))


def bearing_deg(lon1, lat1, lon2, lat2):
    lat1, lat2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def classify_risk(wind_mph, rain_in, snowfall_in, load_weight):
    """Return risk level string per Spotter table."""
    # No-Travel triggers
    if wind_mph >= 55:
        return "No Travel"
    if wind_mph >= 45 and load_weight > 30000:
        return "No Travel"
    # Severe triggers
    if wind_mph >= 45:
        return "Severe"
    if wind_mph >= 35 and load_weight > 40000:
        return "Severe"
    if wind_mph >= 35:
        return "High"
    if snowfall_in >= 2 or rain_in >= 1.5:
        return "Moderate"
    if snowfall_in >= 0.5 or rain_in >= 0.5:
        return "Low"
    return "Clear"


RISK_ORDER = ["Clear", "Low", "Moderate", "High", "Severe", "No Travel"]


def risk_score(level):
    return RISK_ORDER.index(level) if level in RISK_ORDER else 0


# ─────────────────────────────────────────────
#  STEP 1 – GEOCODE
# ─────────────────────────────────────────────

def geocode(place):
    resp = requests.get(
        NOMINATIM_URL,
        params={"q": place, "format": "json", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError(f"Could not geocode: {place}")
    return float(data[0]["lon"]), float(data[0]["lat"])


# ─────────────────────────────────────────────
#  STEP 2 – FETCH ROUTES
# ─────────────────────────────────────────────

def fetch_routes(lon1, lat1, lon2, lat2):
    url = f"{OSRM_URL}/{lon1},{lat1};{lon2},{lat2}"
    params = {"alternatives": "3", "geometries": "geojson", "overview": "full"}
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    routes = resp.json().get("routes", [])

    # Pad to 3 routes with waypoint-offset variants
    while len(routes) < 3:
        idx = len(routes)
        offset = (0.45 if idx % 2 == 0 else -0.45) * ((idx // 2) + 1)
        mid_lat = (lat1 + lat2) / 2 + offset
        mid_lon = (lon1 + lon2) / 2
        wp_url = f"{OSRM_URL}/{lon1},{lat1};{mid_lon},{mid_lat};{lon2},{lat2}"
        try:
            r2 = requests.get(wp_url, params={"geometries": "geojson", "overview": "full"}, timeout=15)
            r2.raise_for_status()
            wp_routes = r2.json().get("routes", [])
            if wp_routes:
                routes.append(wp_routes[0])
            else:
                break
        except Exception:
            break

    return routes[:3]


# ─────────────────────────────────────────────
#  STEP 3 – INTERPOLATE CHECKPOINTS
# ─────────────────────────────────────────────

def interpolate_checkpoints(coords, interval_miles, departure_dt, duration_seconds, total_route_miles=None):
    """
    Walk along the GeoJSON LineString and place a checkpoint every interval_miles.
    Returns list of {lon, lat, mile, eta_iso}.
    """
    if not coords or len(coords) < 2:
        return []

    # Total route distance (used to find speed)
    seg_distances = []
    total_dist = 0.0
    for i in range(len(coords) - 1):
        d = haversine_miles(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
        seg_distances.append(d)
        total_dist += d

    if total_dist == 0:
        return []

    avg_speed_mph = total_dist / (duration_seconds / 3600) if duration_seconds > 0 else 55.0

    checkpoints = []
    accumulated = 0.0
    next_target = interval_miles
    seg_start = 0.0

    for i, seg_d in enumerate(seg_distances):
        seg_end = seg_start + seg_d
        while next_target <= seg_end + 1e-6 and next_target <= total_dist:
            # Fraction along this segment
            frac = (next_target - seg_start) / seg_d if seg_d > 0 else 0
            frac = max(0.0, min(1.0, frac))
            lon = coords[i][0] + frac * (coords[i + 1][0] - coords[i][0])
            lat = coords[i][1] + frac * (coords[i + 1][1] - coords[i][1])
            hours_elapsed = next_target / avg_speed_mph
            eta = departure_dt + timedelta(hours=hours_elapsed)
            checkpoints.append({
                "lon": round(lon, 6),
                "lat": round(lat, 6),
                "mile": round(next_target, 1),
                "eta_iso": eta.isoformat(),
            })
            next_target += interval_miles
        seg_start = seg_end

    return checkpoints


# ─────────────────────────────────────────────
#  STEP 4 – WEATHER FETCH
# ─────────────────────────────────────────────

def fetch_weather_batch(checkpoints):
    """
    Fetch Open-Meteo hourly weather for each unique (lat, lon) checkpoint
    and match to the checkpoint ETA hour.
    Returns checkpoints with weather fields added.
    """
    if not checkpoints:
        return checkpoints

    enriched = []
    for cp in checkpoints:
        try:
            params = {
                "latitude": cp["lat"],
                "longitude": cp["lon"],
                "hourly": "wind_speed_10m,rain,snowfall",
                "wind_speed_unit": "mph",
                "precipitation_unit": "inch",
                "forecast_days": 3,
                "timezone": "UTC",
            }
            resp = requests.get(OPEN_METEO_URL, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            winds = hourly.get("wind_speed_10m", [])
            rains = hourly.get("rain", [])
            snows = hourly.get("snowfall", [])

            # Find closest hour
            eta_dt = datetime.fromisoformat(cp["eta_iso"])
            if eta_dt.tzinfo is None:
                eta_dt = eta_dt.replace(tzinfo=timezone.utc)

            best_idx = 0
            best_diff = float("inf")
            for idx, t_str in enumerate(times):
                t = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
                diff = abs((t - eta_dt).total_seconds())
                if diff < best_diff:
                    best_diff = diff
                    best_idx = idx

            cp["wind_mph"] = winds[best_idx] if best_idx < len(winds) else 0.0
            cp["rain_in"] = rains[best_idx] if best_idx < len(rains) else 0.0
            cp["snowfall_in"] = snows[best_idx] if best_idx < len(snows) else 0.0
        except Exception:
            cp["wind_mph"] = 0.0
            cp["rain_in"] = 0.0
            cp["snowfall_in"] = 0.0

        enriched.append(cp)

    return enriched


def build_heatmap_data(origin_lon, origin_lat, dest_lon, dest_lat):
    """
    Sample a grid of points along the corridor and fetch 0–48h weather
    for the heatmap time slider. Returns a lightweight list of cells.
    """
    steps = 8  # 8 sample points along corridor
    cells = []
    for i in range(steps + 1):
        frac = i / steps
        lat = origin_lat + frac * (dest_lat - origin_lat)
        lon = origin_lon + frac * (dest_lon - origin_lon)
        try:
            params = {
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "hourly": "wind_speed_10m,rain,snowfall",
                "wind_speed_unit": "mph",
                "precipitation_unit": "inch",
                "forecast_days": 3,
                "timezone": "UTC",
            }
            resp = requests.get(OPEN_METEO_URL, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            winds = hourly.get("wind_speed_10m", [])
            rains = hourly.get("rain", [])
            snows = hourly.get("snowfall", [])
            # First 48 hours only
            cells.append({
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "hours": [
                    {
                        "time": times[h] if h < len(times) else None,
                        "wind_mph": winds[h] if h < len(winds) else 0,
                        "rain_in": rains[h] if h < len(rains) else 0,
                        "snowfall_in": snows[h] if h < len(snows) else 0,
                    }
                    for h in range(min(49, len(times)))
                ],
            })
        except Exception:
            cells.append({"lat": round(lat, 4), "lon": round(lon, 4), "hours": []})

    return cells


# ─────────────────────────────────────────────
#  STEP 5 – RISK CLASSIFY & RANK
# ─────────────────────────────────────────────

def classify_route(route_data, load_weight):
    """Add risk field to each checkpoint and compute route-level summary."""
    no_travel_miles = 0
    severe_miles = 0
    high_miles = 0
    risk_scores = []

    for cp in route_data["checkpoints"]:
        risk = classify_risk(cp["wind_mph"], cp["rain_in"], cp["snowfall_in"], load_weight)
        cp["risk"] = risk
        rs = risk_score(risk)
        risk_scores.append(rs)
        if risk == "No Travel":
            no_travel_miles += 1
        elif risk == "Severe":
            severe_miles += 1
        elif risk == "High":
            high_miles += 1

    avg_risk = sum(risk_scores) / len(risk_scores) if risk_scores else 0
    route_data["summary"] = {
        "no_travel_miles": no_travel_miles,
        "severe_miles": severe_miles,
        "high_miles": high_miles,
        "avg_risk_score": round(avg_risk, 3),
        "duration_seconds": route_data["duration_seconds"],
    }
    return route_data


def rank_routes(routes_data):
    """Sort routes: fewest No Travel → fewest Severe → fewest High → lowest avg risk → shortest time."""
    def sort_key(r):
        s = r["summary"]
        return (
            s["no_travel_miles"],
            s["severe_miles"],
            s["high_miles"],
            s["avg_risk_score"],
            s["duration_seconds"],
        )
    return sorted(routes_data, key=sort_key)


# ─────────────────────────────────────────────
#  MAIN ENDPOINT
# ─────────────────────────────────────────────

@api_view(["POST"])
def analyze_routes(request):
    data = request.data
    origin = data.get("origin", "").strip()
    destination = data.get("destination", "").strip()
    departure_time_str = data.get("departure_time") or data.get("departureTime", "")
    load_weight = float(data.get("load_weight") or data.get("loadWeight", 42000))
    interval_miles = int(data.get("interval_miles") or data.get("intervalMiles", 50))

    if not origin or not destination:
        return Response({"error": "origin and destination are required"}, status=status.HTTP_400_BAD_REQUEST)

    # Parse departure time
    try:
        departure_dt = datetime.fromisoformat(departure_time_str)
        if departure_dt.tzinfo is None:
            departure_dt = departure_dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        departure_dt = datetime.now(tz=timezone.utc)

    # ── Step 1: Geocode ──
    try:
        origin_lon, origin_lat = geocode(origin)
        dest_lon, dest_lat = geocode(destination)
    except Exception as e:
        return Response({"error": f"Geocoding failed: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

    # ── Step 2: Fetch routes ──
    try:
        raw_routes = fetch_routes(origin_lon, origin_lat, dest_lon, dest_lat)
    except Exception as e:
        return Response({"error": f"Routing failed: {str(e)}"}, status=status.HTTP_502_BAD_GATEWAY)

    if not raw_routes:
        return Response({"error": "No routes found"}, status=status.HTTP_404_NOT_FOUND)

    # ── Step 3 & 4: Interpolate + weather ──
    routes_data = []
    for idx, route in enumerate(raw_routes):
        coords = route.get("geometry", {}).get("coordinates", [])
        duration_s = route.get("duration", 0)
        distance_m = route.get("distance", 0)
        total_miles = distance_m / 1609.34

        checkpoints = interpolate_checkpoints(
            coords, interval_miles, departure_dt, duration_s, total_miles
        )
        checkpoints = fetch_weather_batch(checkpoints)

        routes_data.append({
            "route_index": idx,
            "geometry": route.get("geometry"),
            "duration_seconds": duration_s,
            "distance_miles": round(total_miles, 1),
            "checkpoints": checkpoints,
        })

    # ── Step 5: Classify & rank ──
    routes_data = [classify_route(r, load_weight) for r in routes_data]
    ranked = rank_routes(routes_data)

    # Assign rank labels
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
        r["label"] = ["Recommended", "Alternative 1", "Alternative 2"][i] if i < 3 else f"Route {i + 1}"

    # ── Heatmap corridor data ──
    try:
        heatmap = build_heatmap_data(origin_lon, origin_lat, dest_lon, dest_lat)
    except Exception:
        heatmap = []

    return Response({
        "origin": {"lon": origin_lon, "lat": origin_lat, "label": origin},
        "destination": {"lon": dest_lon, "lat": dest_lat, "label": destination},
        "departure_time": departure_dt.isoformat(),
        "load_weight": load_weight,
        "interval_miles": interval_miles,
        "routes": ranked,
        "heatmap": heatmap,
    })
