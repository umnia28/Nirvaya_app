// server/services/safetyAssistantService.js
//
// Brain of the AI Safety Assistant.
// Reuses your existing model (predictRiskBatchWithModel) and mirrors the proven
// ORS helpers from your safe-alternatives controller — but parameterised by hour
// so it can answer "is it safe at 10 PM?" and sweep the whole day for a window.
//
// It does NOT import or modify any of your controllers, so nothing working breaks.

import { predictRiskBatchWithModel } from "../utils/riskModel.js";

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = "https://api.openrouteservice.org";

// Bias geocoding toward Dhaka so area names like "Mirpur" resolve correctly.
const DHAKA_FOCUS = { lat: 23.78, lon: 90.4 };

// Keep the 24-hour sweep cheap: cap how many points we score per hour.
const SWEEP_MAX_POINTS = 12;
const SAMPLE_INTERVAL_METERS = 200;

// ---------------------------------------------------------------------------
// geo helpers (copied from your safe-alternatives controller, kept identical)
// ---------------------------------------------------------------------------

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const interpolatePoint = (start, end, fraction) => {
  const [lon1, lat1] = start;
  const [lon2, lat2] = end;
  return [lon1 + (lon2 - lon1) * fraction, lat1 + (lat2 - lat1) * fraction];
};

const sampleRouteEveryMeters = (coordinates, intervalMeters = SAMPLE_INTERVAL_METERS) => {
  const sampled = [];
  if (!coordinates || coordinates.length === 0) return sampled;

  sampled.push(coordinates[0]);
  let distanceSinceLastSample = 0;

  for (let i = 1; i < coordinates.length; i++) {
    let segmentStart = coordinates[i - 1];
    const segmentEnd = coordinates[i];
    let segmentDistance = haversineMeters(
      segmentStart[1], segmentStart[0], segmentEnd[1], segmentEnd[0]
    );
    if (segmentDistance === 0) continue;

    while (distanceSinceLastSample + segmentDistance >= intervalMeters) {
      const needed = intervalMeters - distanceSinceLastSample;
      const fraction = needed / segmentDistance;
      const point = interpolatePoint(segmentStart, segmentEnd, fraction);
      sampled.push(point);
      segmentStart = point;
      segmentDistance = haversineMeters(
        segmentStart[1], segmentStart[0], segmentEnd[1], segmentEnd[0]
      );
      distanceSinceLastSample = 0;
    }
    distanceSinceLastSample += segmentDistance;
  }

  const last = coordinates[coordinates.length - 1];
  const prev = sampled[sampled.length - 1];
  if (!prev || prev[0] !== last[0] || prev[1] !== last[1]) sampled.push(last);
  return sampled;
};

// Evenly thin a list of points down to `max` (keeps endpoints).
const downsample = (points, max) => {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
};

const getBangladeshTimeInfo = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 12);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { hour, day_of_week: map[weekday] ?? 0 };
};

// Geocode a place, disambiguated by district so same-named towns elsewhere in
// Bangladesh don't get matched (e.g. "Mirpur" -> "Mirpur, Dhaka, Bangladesh").
const geocodePlace = async (place, region = "Dhaka") => {
  let text = String(place).trim();
  if (region && !text.toLowerCase().includes(region.toLowerCase())) {
    text += `, ${region}`;
  }
  if (!text.toLowerCase().includes("bangladesh")) {
    text += ", Bangladesh";
  }

  const params = new URLSearchParams({
    text,
    "boundary.country": "BD",
    "focus.point.lat": String(DHAKA_FOCUS.lat),
    "focus.point.lon": String(DHAKA_FOCUS.lon),
    size: "1",
  });

  const res = await fetch(`${ORS_BASE_URL}/geocode/search?${params}`, {
    headers: { Authorization: ORS_API_KEY },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Could not locate "${place}"`);
  const feature = data?.features?.[0];
  if (!feature) throw new Error(`Could not find "${place}" in Bangladesh`);
  const [longitude, latitude] = feature.geometry.coordinates;
  return { latitude, longitude, label: feature.properties?.label || place };
};

// Low-level ORS directions call. `withAlternatives` adds the alternative-routes
// block, which ORS only permits for trips under ~100 km.
const fetchRoutes = async ({ startLat, startLon, endLat, endLon }, withAlternatives) => {
  const body = {
    coordinates: [
      [startLon, startLat],
      [endLon, endLat],
    ],
    instructions: false,
  };

  if (withAlternatives) {
    body.alternative_routes = { target_count: 3, share_factor: 0.6, weight_factor: 1.6 };
  }

  const res = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
    method: "POST",
    headers: { Authorization: ORS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
};

const getAlternativeRoutes = async ({ startLat, startLon, endLat, endLon }) => {
  const coords = { startLat, startLon, endLat, endLon };

  // First try: multiple alternatives (only allowed under ~100 km).
  let result = await fetchRoutes(coords, true);

  // ORS rejects alternatives past 100 km — retry as a single direct route.
  const message = result.data?.error?.message || "";
  const tooFarForAlternatives =
    !result.ok && /100000(\.0)?\s*meters|alternative\s*Routes algorithm|exceed/i.test(message);

  if (tooFarForAlternatives) {
    result = await fetchRoutes(coords, false);
  }

  if (!result.ok) {
    throw new Error(result.data?.error?.message || "Failed to get routes");
  }

  return result.data?.features || [];
};

// ---------------------------------------------------------------------------
// risk summarisation (scale-agnostic: relies on your risk_level labels for the
// categorical level, and on relative score deltas for the time comparison)
// ---------------------------------------------------------------------------

const summarize = (predictions) => {
  const total = predictions.length || 1;
  const norm = (p) => String(p?.risk_level || "").toLowerCase();
  const high = predictions.filter((p) =>
    ["high", "critical", "danger"].includes(norm(p))
  ).length;
  const medium = predictions.filter((p) => norm(p) === "medium").length;
  const avg =
    predictions.reduce((s, p) => s + Number(p?.risk_score || 0), 0) / total;

  const highShare = high / total;
  let level = "low";
  if (highShare >= 0.5) level = "critical";
  else if (highShare >= 0.2) level = "high";
  else if (highShare > 0 || medium / total >= 0.4) level = "medium";

  return {
    avg_risk_score: Number(avg.toFixed(2)),
    high_risk_points: high,
    medium_risk_points: medium,
    total_points: predictions.length,
    level,
  };
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const fmtHour = (h) => {
  const hr = ((h % 24) + 24) % 24;
  const period = hr < 12 ? "AM" : "PM";
  const display = hr % 12 === 0 ? 12 : hr % 12;
  return `${display} ${period}`;
};

// Longest contiguous (wrap-around) run of "safe" hours.
const findSafestWindow = (safeFlags) => {
  const doubled = [...safeFlags, ...safeFlags];
  let best = { start: null, len: 0 };
  let runStart = null;
  let runLen = 0;
  for (let i = 0; i < doubled.length; i++) {
    if (doubled[i]) {
      if (runStart === null) runStart = i;
      runLen++;
      if (runLen > best.len && runLen <= 24) best = { start: runStart % 24, len: runLen };
    } else {
      runStart = null;
      runLen = 0;
    }
  }
  if (best.start === null) return null;
  const end = (best.start + best.len) % 24; // exclusive boundary hour
  return {
    from_hour: best.start,
    to_hour: end,
    from_label: fmtHour(best.start),
    to_label: fmtHour(end),
    length_hours: best.len,
  };
};

// ---------------------------------------------------------------------------
// main entry
// ---------------------------------------------------------------------------

/**
 * @param {string} origin       e.g. "Bashundhara"
 * @param {string} destination  e.g. "Mirpur"
 * @param {number|null} hour    0-23, or null to use current Dhaka time
 * @param {string} district     defaults to "Dhaka"
 */
export const analyzeRouteSafety = async ({
  origin,
  destination,
  hour = null,
  district = "Dhaka",
}) => {
  if (!ORS_API_KEY) throw new Error("ORS_API_KEY is missing in environment variables");

  const now = getBangladeshTimeInfo();
  const requestedHour = Number.isInteger(hour) ? hour : now.hour;
  const dayOfWeek = now.day_of_week;

  // 1) resolve both endpoints to coordinates (district-disambiguated)
  const [from, to] = await Promise.all([
    geocodePlace(origin, district),
    geocodePlace(destination, district),
  ]);

  // 2) candidate routes (falls back to a single route for long trips)
  const routes = await getAlternativeRoutes({
    startLat: from.latitude,
    startLon: from.longitude,
    endLat: to.latitude,
    endLon: to.longitude,
  });
  if (!routes.length) throw new Error("No drivable route found between those areas");

  // 3) sample every route once
  const sampledByRoute = routes.map((r) =>
    sampleRouteEveryMeters(r.geometry?.coordinates || [])
  );

  // 4) rank all routes at the REQUESTED hour in a single batch
  const rankBatch = [];
  const ranges = [];
  sampledByRoute.forEach((pts) => {
    const start = rankBatch.length;
    pts.forEach(([lon, lat]) =>
      rankBatch.push({ latitude: lat, longitude: lon, district, hour: requestedHour, day_of_week: dayOfWeek })
    );
    ranges.push([start, rankBatch.length]);
  });

  const rankPreds = await predictRiskBatchWithModel(rankBatch);

  const scored = routes.map((route, i) => {
    const [s, e] = ranges[i];
    const stats = summarize(rankPreds.slice(s, e));
    const summary = route.properties?.summary || {};
    return {
      index: i,
      ...stats,
      distance_meters: summary.distance ?? null,
      duration_seconds: summary.duration ?? null,
      geometry: route.geometry?.coordinates || [],
    };
  });

  scored.sort((a, b) =>
    a.avg_risk_score !== b.avg_risk_score
      ? a.avg_risk_score - b.avg_risk_score
      : a.high_risk_points !== b.high_risk_points
      ? a.high_risk_points - b.high_risk_points
      : (a.duration_seconds || 0) - (b.duration_seconds || 0)
  );

  const safest = scored[0];
  const fastest = [...scored].sort(
    (a, b) => (a.duration_seconds || 0) - (b.duration_seconds || 0)
  )[0];

  // 5) sweep the SAFEST route across all 24 hours (single batch)
  const sweepPoints = downsample(sampledByRoute[safest.index], SWEEP_MAX_POINTS);
  const sweepBatch = [];
  HOURS.forEach((h) =>
    sweepPoints.forEach(([lon, lat]) =>
      sweepBatch.push({ latitude: lat, longitude: lon, district, hour: h, day_of_week: dayOfWeek })
    )
  );
  const sweepPreds = await predictRiskBatchWithModel(sweepBatch);

  const hourlyAvg = HOURS.map((h) => {
    const slice = sweepPreds.slice(h * sweepPoints.length, (h + 1) * sweepPoints.length);
    return summarize(slice).avg_risk_score;
  });

  // route-vs-time decomposition
  const minScore = Math.min(...hourlyAvg);
  const maxScore = Math.max(...hourlyAvg);
  const band = maxScore - minScore;
  const baselineHour = hourlyAvg.indexOf(minScore);
  const scoreAtHour = hourlyAvg[requestedHour];

  // 0..1: how much worse the chosen hour is vs the route's best hour
  const timeRiskRatio = band > 0 ? (scoreAtHour - minScore) / band : 0;
  const timeRiskLabel =
    timeRiskRatio >= 0.66 ? "high" : timeRiskRatio >= 0.33 ? "moderate" : "low";

  // safe = within the bottom quarter of the route's own daily risk band
  const safeFlags = hourlyAvg.map((v) => v <= minScore + 0.25 * band);
  const window = findSafestWindow(safeFlags);
  const requestedHourIsSafe = safeFlags[requestedHour];

  const trim = (r) => ({
    label: r.index === safest.index ? "Safest route" : "Alternative route",
    level: r.level,
    avg_risk_score: r.avg_risk_score,
    high_risk_points: r.high_risk_points,
    distance_km: r.distance_meters ? Number((r.distance_meters / 1000).toFixed(1)) : null,
    duration_min: r.duration_seconds ? Math.round(r.duration_seconds / 60) : null,
  });

  return {
    origin: from,
    destination: to,
    requested_hour: requestedHour,
    requested_hour_label: fmtHour(requestedHour),
    district,

    route_risk: {
      level: safest.level,
      avg_risk_score: safest.avg_risk_score,
      high_risk_points: safest.high_risk_points,
      total_points: safest.total_points,
      distance_km: safest.distance_meters ? Number((safest.distance_meters / 1000).toFixed(1)) : null,
      duration_min: safest.duration_seconds ? Math.round(safest.duration_seconds / 60) : null,
      baseline_score: Number(minScore.toFixed(2)),
      baseline_hour_label: fmtHour(baselineHour),
    },

    time_risk: {
      level: timeRiskLabel,
      ratio: Number(timeRiskRatio.toFixed(2)),
      score_at_hour: Number(scoreAtHour.toFixed(2)),
      best_score: Number(minScore.toFixed(2)),
      worst_score: Number(maxScore.toFixed(2)),
      requested_hour_is_safe: requestedHourIsSafe,
    },

    safer_alternative: {
      // the safest route, and how it compares to the fastest option
      safest: trim(safest),
      fastest: trim(fastest),
      differs_from_fastest: safest.index !== fastest.index,
      extra_minutes:
        safest.duration_seconds && fastest.duration_seconds
          ? Math.max(0, Math.round((safest.duration_seconds - fastest.duration_seconds) / 60))
          : 0,
    },

    recommended_window: window, // { from_label, to_label, length_hours } | null

    // safest route geometry so the client can draw it if you want
    safest_route_geometry: safest.geometry,
  };
};
