// server/routes/reports.routes.js
//
// Wire it up in your main server file (matching how your other routes are
// mounted), e.g.:
//
//   import reportsRouter from "./routes/reports.routes.js";
//   app.use("/reports", reportsRouter);
//
// If your backend is CommonJS, swap the import/export lines for:
//   const express = require("express");
//   const { pool } = require("../db");
//   ...
//   module.exports = router;

import express from "express";
import pool from "../config/db.js";
//import { pool } from "../index.js"; 

const router = express.Router();

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

// POST /reports — create a community safety report
router.post("/", async (req, res) => {
  try {
    const deviceId = req.headers["x-device-id"];
    if (!deviceId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing device id." });
    }

    const { category, description, latitude, longitude, district } = req.body;

    if (!VALID_CATEGORIES.has(category)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid category." });
    }
    if (!isValidLat(latitude) || !isValidLng(longitude)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid coordinates." });
    }

    // Ensure the device row exists / refresh last_seen (same pattern as SOS).
    await pool.query(
      `INSERT INTO anonymous_devices (device_id)
         VALUES ($1)
       ON CONFLICT (device_id)
         DO UPDATE SET last_seen_at = NOW()`,
      [deviceId]
    );

    const cleanDescription =
      typeof description === "string" && description.trim()
        ? description.trim().slice(0, 500)
        : null;

    const { rows } = await pool.query(
      `INSERT INTO user_reports
         (device_id, category, description, latitude, longitude, district)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, category, latitude, longitude, district, created_at`,
      [
        deviceId,
        category,
        cleanDescription,
        latitude,
        longitude,
        district || "Dhaka",
      ]
    );

    return res.status(201).json({ success: true, report: rows[0] });
  } catch (err) {
    console.error("Create report error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to save report." });
  }
});

// GET /reports/nearby?lat=..&lng=..&radius=..  (radius in km, default 3)
// Useful later for the heatmap / "reports near me".
router.get("/nearby", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radius) || 3;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res
        .status(400)
        .json({ success: false, message: "lat and lng are required." });
    }

    // Cheap, index-friendly bounding box. Good enough for a city-scale heatmap.
    const latDelta = radiusKm / 111;
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
    const lngDelta = radiusKm / (111 * cosLat);

    const { rows } = await pool.query(
      `SELECT id, category, description, latitude, longitude, district, created_at
         FROM user_reports
        WHERE latitude  BETWEEN $1 AND $2
          AND longitude BETWEEN $3 AND $4
          AND created_at > NOW() - INTERVAL '90 days'
        ORDER BY created_at DESC
        LIMIT 500`,
      [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
    );

    return res.json({ success: true, reports: rows });
  } catch (err) {
    console.error("Nearby reports error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load reports." });
  }
});

export default router;
