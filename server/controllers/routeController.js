import { predictRiskBatchWithModel } from "../utils/riskModel.js";

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = "https://api.openrouteservice.org";

const toNumber = (value) => Number.parseFloat(value);

const getBangladeshTimeInfo = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === "hour")?.value || 12);
  const weekday = parts.find((part) => part.type === "weekday")?.value;

  const weekdayMap = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  return {
    hour,
    day_of_week: weekdayMap[weekday] ?? 0,
  };
};

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const interpolatePoint = (start, end, fraction) => {
  const [lon1, lat1] = start;
  const [lon2, lat2] = end;

  return [
    lon1 + (lon2 - lon1) * fraction,
    lat1 + (lat2 - lat1) * fraction,
  ];
};

const sampleRouteEveryMeters = (coordinates, intervalMeters = 100) => {
  const sampled = [];

  if (!coordinates || coordinates.length === 0) {
    return sampled;
  }

  sampled.push(coordinates[0]);

  let distanceSinceLastSample = 0;

  for (let i = 1; i < coordinates.length; i++) {
    let segmentStart = coordinates[i - 1];
    const segmentEnd = coordinates[i];

    let segmentDistance = haversineMeters(
      segmentStart[1],
      segmentStart[0],
      segmentEnd[1],
      segmentEnd[0]
    );

    if (segmentDistance === 0) continue;

    while (distanceSinceLastSample + segmentDistance >= intervalMeters) {
      const neededDistance = intervalMeters - distanceSinceLastSample;
      const fraction = neededDistance / segmentDistance;

      const sampledPoint = interpolatePoint(segmentStart, segmentEnd, fraction);

      sampled.push(sampledPoint);

      segmentStart = sampledPoint;

      segmentDistance = haversineMeters(
        segmentStart[1],
        segmentStart[0],
        segmentEnd[1],
        segmentEnd[0]
      );

      distanceSinceLastSample = 0;
    }

    distanceSinceLastSample += segmentDistance;
  }

  const last = coordinates[coordinates.length - 1];
  const previousLast = sampled[sampled.length - 1];

  if (
    !previousLast ||
    previousLast[0] !== last[0] ||
    previousLast[1] !== last[1]
  ) {
    sampled.push(last);
  }

  return sampled;
};

const geocodeDestination = async (destination) => {
  const params = new URLSearchParams({
    text: destination,
    "boundary.country": "BD",
    size: "1",
  });

  const response = await fetch(
    `${ORS_BASE_URL}/geocode/search?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: ORS_API_KEY,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Destination geocoding failed");
  }

  const feature = data?.features?.[0];

  if (!feature) {
    throw new Error("Destination not found");
  }

  const [longitude, latitude] = feature.geometry.coordinates;

  return {
    latitude,
    longitude,
    label: feature.properties?.label || destination,
  };
};

const getAlternativeRoutes = async ({
  startLatitude,
  startLongitude,
  endLatitude,
  endLongitude,
}) => {
  const response = await fetch(
    `${ORS_BASE_URL}/v2/directions/driving-car/geojson`,
    {
      method: "POST",
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [startLongitude, startLatitude],
          [endLongitude, endLatitude],
        ],
        alternative_routes: {
          target_count: 3,
          share_factor: 0.6,
          weight_factor: 1.6,
        },
        instructions: true,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Failed to get alternative routes");
  }

  return data?.features || [];
};

const calculateRouteRiskFromPredictions = (predictions) => {
  if (!predictions.length) {
    return {
      avg_risk_score: 0,
      high_risk_points: 0,
      medium_risk_points: 0,
    };
  }

  const totalRisk = predictions.reduce((sum, item) => {
    return sum + Number(item.risk_score || 0);
  }, 0);

  const avgRiskScore = totalRisk / predictions.length;

  const highRiskPoints = predictions.filter(
    (item) =>
      item.risk_level === "high" ||
      item.risk_level === "critical" ||
      item.risk_level === "danger"
  ).length;

  const mediumRiskPoints = predictions.filter(
    (item) => item.risk_level === "medium"
  ).length;

  return {
    avg_risk_score: Number(avgRiskScore.toFixed(2)),
    high_risk_points: highRiskPoints,
    medium_risk_points: mediumRiskPoints,
  };
};

// POST /api/routes/safe-alternatives
export const getSafeAlternativeRoutes = async (req, res) => {
  try {
    const {
      start_latitude,
      start_longitude,
      destination,
      district = "Dhaka",
    } = req.body;

    if (!start_latitude || !start_longitude || !destination) {
      return res.status(400).json({
        success: false,
        message: "start_latitude, start_longitude, and destination are required",
      });
    }

    if (!ORS_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "ORS_API_KEY is missing in environment variables",
      });
    }

    const startLatitude = toNumber(start_latitude);
    const startLongitude = toNumber(start_longitude);

    if (Number.isNaN(startLatitude) || Number.isNaN(startLongitude)) {
      return res.status(400).json({
        success: false,
        message: "Invalid start latitude or longitude",
      });
    }

    const destinationData = await geocodeDestination(destination);

    const routes = await getAlternativeRoutes({
      startLatitude,
      startLongitude,
      endLatitude: destinationData.latitude,
      endLongitude: destinationData.longitude,
    });

    if (!routes.length) {
      return res.status(404).json({
        success: false,
        message: "No routes found",
      });
    }

    const { hour, day_of_week } = getBangladeshTimeInfo();

    const routeSampleGroups = [];
    const batchPoints = [];

    routes.forEach((route, routeIndex) => {
      const coordinates = route.geometry?.coordinates || [];

      const sampledCoordinates = sampleRouteEveryMeters(coordinates, 100);

      const startIndex = batchPoints.length;

      sampledCoordinates.forEach((coord) => {
        const [longitude, latitude] = coord;

        batchPoints.push({
          latitude,
          longitude,
          district,
          hour,
          day_of_week,
        });
      });

      const endIndex = batchPoints.length;

      routeSampleGroups.push({
        routeIndex,
        startIndex,
        endIndex,
        sampledCoordinates,
      });
    });

    const allPredictions = await predictRiskBatchWithModel(batchPoints);

    const scoredRoutes = routes.map((route, index) => {
      const summary = route.properties?.summary || {};
      const group = routeSampleGroups[index];

      const routePredictions = allPredictions.slice(
        group.startIndex,
        group.endIndex
      );

      const risk = calculateRouteRiskFromPredictions(routePredictions);

      return {
        route_index: index + 1,

        // Internal sorting values only.
        // These will NOT be returned to frontend.
        _avg_risk_score: risk.avg_risk_score,
        _high_risk_points: risk.high_risk_points,
        _medium_risk_points: risk.medium_risk_points,

        distance_meters: summary.distance || null,
        duration_seconds: summary.duration || null,
        sampled_points_count: group.sampledCoordinates.length,

        // ORS geometry format: [longitude, latitude]
        // Frontend will use this to draw Polyline.
        geometry: route.geometry?.coordinates || [],
      };
    });

    // Safest route first.
    scoredRoutes.sort((a, b) => {
      if (a._avg_risk_score !== b._avg_risk_score) {
        return a._avg_risk_score - b._avg_risk_score;
      }

      if (a._high_risk_points !== b._high_risk_points) {
        return a._high_risk_points - b._high_risk_points;
      }

      if (a._medium_risk_points !== b._medium_risk_points) {
        return a._medium_risk_points - b._medium_risk_points;
      }

      return (a.duration_seconds || 0) - (b.duration_seconds || 0);
    });

    const rankedRoutes = scoredRoutes.map((route, index) => {
      const {
        _avg_risk_score,
        _high_risk_points,
        _medium_risk_points,
        ...publicRoute
      } = route;

      return {
        ...publicRoute,
        safety_rank: index + 1,
        label:
          index === 0
            ? "Safest Available Route"
            : index === 1
            ? "Alternative Route"
            : "Another Route",
      };
    });

    return res.status(200).json({
      success: true,
      message: "Alternative routes ranked by safety",
      start: {
        latitude: startLatitude,
        longitude: startLongitude,
      },
      destination: destinationData,
      checked_points_count: batchPoints.length,
      routes: rankedRoutes,
    });
  } catch (error) {
    console.error("Safe alternative route error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate safe alternative routes",
      error: error.message,
    });
  }
};
