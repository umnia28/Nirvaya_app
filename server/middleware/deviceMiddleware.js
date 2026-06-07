import pool from "../config/db.js";

export const attachDevice = async (req, res, next) => {
  try {
    const deviceId = req.headers["x-device-id"];

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "x-device-id header is required",
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

    req.deviceId = deviceId;

    next();
  } catch (error) {
    console.error("Attach device error:", error);

    return res.status(500).json({
      success: false,
      message: "Device tracking error",
      error: error.message,
    });
  }
};