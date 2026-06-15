import pool from "../config/db.js";

const VALID_CATEGORIES = new Set([
  "stalking",
  "eve_teasing",
  "suspicious_person",
  "snatching",
  "poor_lighting",
  "other",
]);

const isValidLat = (n) => typeof n === "number" && n >= -90 && n <= 90;
const isValidLng = (n) => typeof n === "number" && n >= -180 && n <= 180;

const normalizeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const createReport = async (req, res) => {
  try {
    const deviceId = req.headers["x-device-id"];

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Missing device id.",
      });
    }

    const { category, description, latitude, longitude, district } = req.body;

    const lat = normalizeNumber(latitude);
    const lng = normalizeNumber(longitude);

    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category.",
      });
    }

    if (!isValidLat(lat) || !isValidLng(lng)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates.",
      });
    }

    await pool.query(
      `
      INSERT INTO anonymous_devices (device_id)
      VALUES ($1)
      ON CONFLICT (device_id)
      DO UPDATE SET last_seen_at = NOW()
      `,
      [deviceId]
    );

    const cleanDescription =
      typeof description === "string" && description.trim()
        ? description.trim().slice(0, 500)
        : null;

    const cleanDistrict =
      typeof district === "string" && district.trim()
        ? district.trim()
        : "Dhaka";

    const { rows } = await pool.query(
      `
      INSERT INTO user_reports
        (device_id, category, description, latitude, longitude, district)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        category,
        latitude,
        longitude,
        district,
        created_at
      `,
      [deviceId, category, cleanDescription, lat, lng, cleanDistrict]
    );

    return res.status(201).json({
      success: true,
      report: rows[0],
    });
  } catch (error) {
    console.error("Create report error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save report.",
      error: error.message,
    });
  }
};

export const getNearbyReports = async (req, res) => {
  try {
    const lat = normalizeNumber(req.query.lat);
    const lng = normalizeNumber(req.query.lng);
    const radiusKm = normalizeNumber(req.query.radius) || 3;

    if (!isValidLat(lat) || !isValidLng(lng)) {
      return res.status(400).json({
        success: false,
        message: "Valid lat and lng are required.",
      });
    }

    const safeRadiusKm = Math.min(Math.max(radiusKm, 0.1), 20);

    const latDelta = safeRadiusKm / 111;
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
    const lngDelta = safeRadiusKm / (111 * cosLat);

    const { rows } = await pool.query(
      `
      SELECT
        id,
        category,
        description,
        latitude,
        longitude,
        district,
        created_at
      FROM user_reports
      WHERE latitude BETWEEN $1 AND $2
        AND longitude BETWEEN $3 AND $4
        AND created_at > NOW() - INTERVAL '90 days'
      ORDER BY created_at DESC
      LIMIT 500
      `,
      [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
    );

    return res.status(200).json({
      success: true,
      reports: rows,
    });
  } catch (error) {
    console.error("Nearby reports error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load reports.",
      error: error.message,
    });
  }
};