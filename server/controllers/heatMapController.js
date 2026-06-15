import pool from "../config/db.js";
import { predictRiskBatchWithModel } from "../utils/riskModel.js";

const toNumber = (value) => Number.parseFloat(value);

const getBangladeshTimeInfo = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(
    parts.find((part) => part.type === "hour")?.value || 12
  );

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

const normalizeHeatmapWeight = (riskScore) => {
  const score = Number(riskScore || 0);


  return Math.max(0, Math.min(score / 100, 1));
};

// GET /api/heatmap/live
export const getLiveRiskHeatmap = async (req, res) => {
  try {
    const { district, limit = 1000 } = req.query;

    const values = [];

    const conditions = [
      "latitude IS NOT NULL",
      "longitude IS NOT NULL",
      "geocoded = TRUE",
    ];

    if (district) {
      values.push(district);
      conditions.push(`LOWER(district) = LOWER($${values.length})`);
    }

    values.push(Number(limit));
    const limitIndex = values.length;

    const zonesResult = await pool.query(
      `
      SELECT
        id,
        district,
        zone_name,
        latitude,
        longitude
      FROM zones
      WHERE ${conditions.join(" AND ")}
      ORDER BY district ASC, zone_name ASC
      LIMIT $${limitIndex}
      `,
      values
    );

    const zones = zonesResult.rows;

    if (zones.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No geocoded zones found for heatmap",
      });
    }

    const { hour, day_of_week } = getBangladeshTimeInfo();

    const modelPoints = zones.map((zone) => ({
      latitude: toNumber(zone.latitude),
      longitude: toNumber(zone.longitude),
      district: zone.district,
      hour,
      day_of_week,
    }));

    const predictions = await predictRiskBatchWithModel(modelPoints);

    const heatmap = zones.map((zone, index) => {
      const prediction = predictions[index];

      const riskScore = Number(prediction?.risk_score || 0);
      const riskLevel = prediction?.risk_level || "low";

      return {
        id: zone.id,
        district: zone.district,
        zone_name: zone.zone_name,

        latitude: toNumber(zone.latitude),
        longitude: toNumber(zone.longitude),

        risk_score: riskScore,
        risk_level: riskLevel,
        predicted_area_risk: prediction?.predicted_area_risk || riskLevel,
        probabilities: prediction?.probabilities || {},

        weight: normalizeHeatmapWeight(riskScore),

        hour,
        day_of_week,
        time_of_day: prediction?.time_of_day || null,
      };
    });

    return res.status(200).json({
      success: true,
      source: "ai_model",
      message: "Live AI heatmap generated successfully",
      count: heatmap.length,
      district: district || "all",
      hour,
      day_of_week,
      heatmap,
    });
  } catch (error) {
    console.error("Live heatmap error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate live AI heatmap",
      error: error.message,
    });
  }
};