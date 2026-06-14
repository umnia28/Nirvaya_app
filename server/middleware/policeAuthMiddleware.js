import jwt from "jsonwebtoken";
import pool from "../config/db.js";

export const protectPolice = async (req, res, next) => {
  try {
    const token = req.cookies?.police_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Police login required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "police") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Police only.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        district,
        thana,
        address,
        latitude,
        longitude,
        phone,
        is_verified,
        created_at
      FROM police_stations
      WHERE id = $1
      `,
      [decoded.policeStationId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Police station account not found",
      });
    }

    const policeStation = result.rows[0];

    if (!policeStation.is_verified) {
      return res.status(403).json({
        success: false,
        message: "Police station account is not verified yet",
      });
    }

    req.policeStationId = policeStation.id;
    req.policeStation = policeStation;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired police login",
      error: error.message,
    });
  }
};