import pool from "../config/db.js";
import { predictRiskWithModel } from "../utils/riskModel.js";

const normalizeRiskLevel = (riskLevel) => {
  if (!riskLevel) return "low";
  if (riskLevel === "danger") return "critical";
  return riskLevel;
};

// POST /api/location/update
// Used for continuous tracking every 1 minute.
// This saves location to user_location_updates table.
export const updateDeviceLocation = async (req, res) => {
  try {
    const deviceId = req.deviceId;

    const {
      latitude,
      longitude,
      district = "Dhaka",
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
      });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const modelPrediction = await predictRiskWithModel({
      latitude,
      longitude,
      district,
    });

    const riskScore = Number(modelPrediction.risk_score || 0);
    const riskLevel = normalizeRiskLevel(modelPrediction.risk_level);

    const savedLocation = await pool.query(
      `
      INSERT INTO user_location_updates (
        device_id,
        latitude,
        longitude,
        risk_score,
        risk_level
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [deviceId, latitude, longitude, riskScore, riskLevel]
    );

    return res.status(201).json({
      success: true,
      message: "Location updated successfully",
      location: savedLocation.rows[0],
      risk: {
        source: "model",
        district,
        risk_score: riskScore,
        risk_level: riskLevel,
        model_prediction: modelPrediction,
      },
    });
  } catch (error) {
    console.error("Update device location error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// POST /api/location/risk-check
// Used once when page loads.
// This only checks risk; it does NOT save location.
export const checkCurrentLocationRisk = async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      district = "Dhaka",
    } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const modelPrediction = await predictRiskWithModel({
      latitude,
      longitude,
      district,
    });

    const riskScore = Number(modelPrediction.risk_score || 0);
    const riskLevel = normalizeRiskLevel(modelPrediction.risk_level);

    return res.status(200).json({
      success: true,
      message: "Current location risk checked successfully",
      risk: {
        source: "model",
        district,
        risk_score: riskScore,
        risk_level: riskLevel,
        model_prediction: modelPrediction,
      },
    });
  } catch (error) {
    console.error("Check current location risk error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};