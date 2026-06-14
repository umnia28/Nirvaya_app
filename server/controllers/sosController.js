// import crypto from "crypto";
// import pool from "../config/db.js";
// import { io } from "../index.js";
// import { generateEmergencyMessage } from "../utils/generateEmergencyMessage.js";
// import { generateIncidentReport } from "../utils/generateIncidentReport.js";

// const cleanEmergencyContacts = (contacts) => {
//   if (!Array.isArray(contacts)) return [];
//   return contacts
//     .filter((contact) => contact?.phone)
//     .map((contact) => ({
//       name: contact.name || "Emergency Contact",
//       phone: String(contact.phone).trim(),
//       relation: contact.relation || null,
//       is_primary: Boolean(contact.is_primary),
//     }));
// };

// const buildTrackingLink = (publicToken) => {
//   const clientUrl = process.env.CLIENT_URL;
//   if (!clientUrl) return `/track/${publicToken}`;
//   return `${clientUrl.replace(/\/$/, "")}/track/${publicToken}`;
// };

// const buildGoogleMapsLink = (latitude, longitude) => {
//   return `https://maps.google.com/?q=${latitude},${longitude}`;
// };

// export const startSos = async (req, res) => {
//   const client = await pool.connect();

//   try {
//     const deviceId = req.deviceId;
//     const {
//       latitude,
//       longitude,
//       trigger_type = "button",
//       risk_score = null,
//       emergency_contacts = [],
//       user_name = null,
//       district = "Dhaka",
//     } = req.body;

//     if (!deviceId) {
//       return res.status(400).json({
//         success: false,
//         message: "Device ID is required",
//       });
//     }

//     if (!latitude || !longitude) {
//       return res.status(400).json({
//         success: false,
//         message: "Latitude and longitude are required",
//       });
//     }

//     const contacts = cleanEmergencyContacts(emergency_contacts);

//     const activeSosResult = await client.query(
//       `SELECT * FROM sos_alerts
//        WHERE device_id = $1 AND status = 'active'
//        ORDER BY created_at DESC LIMIT 1`,
//       [deviceId]
//     );

//     if (activeSosResult.rows.length > 0) {
//       const activeSos = activeSosResult.rows[0];
//       return res.status(200).json({
//         success: true,
//         alreadyActive: true,
//         message: "SOS is already active for this device.",
//         sos: activeSos,
//         publicToken: activeSos.public_token,
//         trackingLink: buildTrackingLink(activeSos.public_token),
//       });
//     }

//     const publicToken = crypto.randomBytes(32).toString("hex");

//     await client.query("BEGIN");

//     const sosResult = await client.query(
//       `INSERT INTO sos_alerts (
//         device_id, trigger_type, latitude, longitude,
//         risk_score, status, public_token
//        ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
//        RETURNING *`,
//       [deviceId, trigger_type, latitude, longitude, risk_score, publicToken]
//     );

//     const sos = sosResult.rows[0];

//     await client.query(
//       `INSERT INTO sos_location_updates (sos_alert_id, latitude, longitude)
//        VALUES ($1, $2, $3)`,
//       [sos.id, latitude, longitude]
//     );

//     const policeResult = await client.query(
//       `SELECT id, name, phone, district, thana, latitude, longitude,
//         (6371000 * acos(
//           cos(radians($1)) * cos(radians(latitude)) *
//           cos(radians(longitude) - radians($2)) +
//           sin(radians($1)) * sin(radians(latitude))
//         )) AS distance_meters
//        FROM police_stations
//        ORDER BY distance_meters ASC LIMIT 1`,
//       [latitude, longitude]
//     );

//     await client.query("COMMIT");

//     const trackingLink = buildTrackingLink(publicToken);
//     const googleMapsLink = buildGoogleMapsLink(latitude, longitude);

//     const riskLevel =
//       risk_score >= 8 ? "critical"
//       : risk_score >= 5 ? "high"
//       : risk_score >= 3 ? "medium"
//       : "low";

//     const aiMessage = generateEmergencyMessage({
//       userName: user_name || "App User",
//       latitude,
//       longitude,
//       district,
//       riskLevel,
//       riskScore: risk_score,
//       trackingLink,
//       triggerType: trigger_type,
//       timestamp: new Date().toISOString(),
//     });

//     console.log("AI Emergency Message:\n", aiMessage);
//     console.log("Emergency Contacts:", contacts);
//     console.log("Nearest Police:", policeResult.rows[0]);

//     io.to(publicToken).emit("sos_started", {
//       latitude,
//       longitude,
//       status: "active",
//       recorded_at: sos.created_at,
//     });

//     return res.status(201).json({
//       success: true,
//       message: "SOS started successfully",
//       sos,
//       publicToken,
//       trackingLink,
//       googleMapsLink,
//       emergency_contacts: contacts,
//       nearest_police_station: policeResult.rows[0] || null,
//       ai_message: aiMessage,
//     });
//   } catch (error) {
//     try { await client.query("ROLLBACK"); } catch {}
//     console.error("Start SOS error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message,
//     });
//   } finally {
//     client.release();
//   }
// };

// export const updateSosLocation = async (req, res) => {
//   try {
//     const { sosId } = req.params;
//     const deviceId = req.deviceId;
//     const { latitude, longitude } = req.body;

//     if (!deviceId) {
//       return res.status(400).json({
//         success: false,
//         message: "Device ID is required",
//       });
//     }

//     if (!latitude || !longitude) {
//       return res.status(400).json({
//         success: false,
//         message: "Latitude and longitude are required",
//       });
//     }

//     const sosResult = await pool.query(
//       `SELECT id, public_token, status FROM sos_alerts
//        WHERE id = $1 AND device_id = $2`,
//       [sosId, deviceId]
//     );

//     if (sosResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "SOS not found for this device",
//       });
//     }

//     const sos = sosResult.rows[0];

//     if (sos.status !== "active") {
//       return res.status(400).json({
//         success: false,
//         message: "SOS is not active",
//       });
//     }

//     const locationResult = await pool.query(
//       `INSERT INTO sos_location_updates (sos_alert_id, latitude, longitude)
//        VALUES ($1, $2, $3)
//        RETURNING latitude, longitude, recorded_at`,
//       [sosId, latitude, longitude]
//     );

//     const latestLocation = locationResult.rows[0];

//     io.to(sos.public_token).emit("location_update", {
//       latitude: latestLocation.latitude,
//       longitude: latestLocation.longitude,
//       recorded_at: latestLocation.recorded_at,
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Location updated",
//       location: latestLocation,
//     });
//   } catch (error) {
//     console.error("Update SOS location error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message,
//     });
//   }
// };

// export const getTrackingLocation = async (req, res) => {
//   try {
//     const { publicToken } = req.params;

//     const result = await pool.query(
//       `SELECT sa.id, sa.status, sa.created_at, sa.resolved_at,
//         slu.latitude, slu.longitude, slu.recorded_at
//        FROM sos_alerts sa
//        JOIN LATERAL (
//          SELECT latitude, longitude, recorded_at
//          FROM sos_location_updates
//          WHERE sos_alert_id = sa.id
//          ORDER BY recorded_at DESC LIMIT 1
//        ) slu ON true
//        WHERE sa.public_token = $1`,
//       [publicToken]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Tracking link not found",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       tracking: result.rows[0],
//     });
//   } catch (error) {
//     console.error("Get tracking error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message,
//     });
//   }
// };

// export const resolveSos = async (req, res) => {
//   try {
//     const { sosId } = req.params;
//     const deviceId = req.deviceId;

//     if (!deviceId) {
//       return res.status(400).json({
//         success: false,
//         message: "Device ID is required",
//       });
//     }

//     const result = await pool.query(
//       `UPDATE sos_alerts
//        SET status = 'resolved', resolved_at = NOW()
//        WHERE id = $1 AND device_id = $2 AND status = 'active'
//        RETURNING *`,
//       [sosId, deviceId]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Active SOS not found for this device",
//       });
//     }

//     const sos = result.rows[0];

//     io.to(sos.public_token).emit("sos_resolved", {
//       status: "resolved",
//       resolved_at: sos.resolved_at,
//     });

//     return res.status(200).json({
//       success: true,
//       message: "SOS resolved",
//       sos,
//     });
//   } catch (error) {
//     console.error("Resolve SOS error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message,
//     });
//   }
// };

// export const getIncidentReport = async (req, res) => {
//   const client = await pool.connect();

//   try {
//     const { sosId } = req.params;
//     const deviceId = req.deviceId;

//     // Fetch SOS alert
//     const sosResult = await client.query(
//       `SELECT * FROM sos_alerts
//        WHERE id = $1 AND device_id = $2`,
//       [sosId, deviceId]
//     );

//     if (sosResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "SOS not found",
//       });
//     }

//     const sos = sosResult.rows[0];

//     // Fetch full location history
//     const locationResult = await client.query(
//       `SELECT latitude, longitude, recorded_at
//        FROM sos_location_updates
//        WHERE sos_alert_id = $1
//        ORDER BY recorded_at ASC`,
//       [sosId]
//     );

//     const locationHistory = locationResult.rows;
//     const trackingLink = buildTrackingLink(sos.public_token);

//     const durationMinutes = sos.resolved_at
//       ? Math.round(
//           (new Date(sos.resolved_at) - new Date(sos.created_at)) / 60000
//         )
//       : 0;

//     const riskLevel =
//       sos.risk_score >= 8 ? "critical"
//       : sos.risk_score >= 5 ? "high"
//       : sos.risk_score >= 3 ? "medium"
//       : "low";

//     // Generate report text
//     const reportText = generateIncidentReport({
//       userName: sos.user_name || "App User",
//       sosId: sos.id,
//       startTime: sos.created_at,
//       endTime: sos.resolved_at || new Date().toISOString(),
//       district: sos.district || "Dhaka",
//       locationHistory,
//       riskScore: sos.risk_score,
//       triggerType: sos.trigger_type,
//       trackingLink,
//     });

//     // Check if report already exists for this SOS
//     const existingReport = await client.query(
//       `SELECT id FROM incident_reports WHERE sos_alert_id = $1`,
//       [sosId]
//     );

//     let savedReport;

//     if (existingReport.rows.length > 0) {
//       // Update existing report
//       const updateResult = await client.query(
//         `UPDATE incident_reports
//          SET report_text = $1, generated_at = NOW()
//          WHERE sos_alert_id = $2
//          RETURNING *`,
//         [reportText, sosId]
//       );
//       savedReport = updateResult.rows[0];
//       console.log("Incident report updated in DB:", savedReport.id);
//     } else {
//       // Insert new report
//       const insertResult = await client.query(
//         `INSERT INTO incident_reports (
//           sos_alert_id,
//           device_id,
//           report_text,
//           district,
//           latitude,
//           longitude,
//           risk_score,
//           risk_level,
//           trigger_type,
//           duration_minutes,
//           location_points_count
//          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//          RETURNING *`,
//         [
//           sosId,
//           deviceId,
//           reportText,
//           sos.district || "Dhaka",
//           sos.latitude,
//           sos.longitude,
//           sos.risk_score,
//           riskLevel,
//           sos.trigger_type,
//           durationMinutes,
//           locationHistory.length,
//         ]
//       );
//       savedReport = insertResult.rows[0];
//       console.log("Incident report saved to DB:", savedReport.id);
//     }

//     return res.status(200).json({
//       success: true,
//       report: reportText,
//       report_id: savedReport.id,
//       generated_at: savedReport.generated_at,
//     });
//   } catch (error) {
//     console.error("Incident report error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to generate incident report",
//       error: error.message,
//     });
//   } finally {
//     client.release();
//   }
// };
import crypto from "crypto";
import pool from "../config/db.js";
import { io } from "../index.js";
import { generateEmergencyMessage } from "../utils/generateEmergencyMessage.js";
import { generateIncidentReport } from "../utils/generateIncidentReport.js";

const cleanEmergencyContacts = (contacts) => {
  if (!Array.isArray(contacts)) return [];

  return contacts
    .filter((contact) => contact?.phone)
    .map((contact) => ({
      name: contact.name || "Emergency Contact",
      phone: String(contact.phone).trim(),
      relation: contact.relation || null,
      is_primary: Boolean(contact.is_primary),
    }));
};

const buildTrackingLink = (publicToken) => {
  const clientUrl = process.env.CLIENT_URL;

  if (!clientUrl) return `/track/${publicToken}`;

  return `${clientUrl.replace(/\/$/, "")}/track/${publicToken}`;
};

const buildGoogleMapsLink = (latitude, longitude) => {
  return `https://maps.google.com/?q=${latitude},${longitude}`;
};

const calculateRiskLevel = (riskScore) => {
  const score = Number(riskScore ?? 0);

  if (score >= 75) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";

  return "low";
};

const findNearestPoliceStation = async (client, latitude, longitude) => {
  const result = await client.query(
    `
    SELECT
      id,
      name,
      phone,
      district,
      thana,
      latitude,
      longitude,
      (
        6371000 * acos(
          cos(radians($1)) *
          cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) *
          sin(radians(latitude))
        )
      ) AS distance_meters
    FROM police_stations
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
    ORDER BY distance_meters ASC
    LIMIT 1
    `,
    [latitude, longitude]
  );

  return result.rows[0] || null;
};

export const startSos = async (req, res) => {
  const client = await pool.connect();

  try {
    const deviceId = req.deviceId;

    const {
      latitude,
      longitude,
      trigger_type = "button",
      risk_score = null,
      emergency_contacts = [],
      user_name = null,
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

    const contacts = cleanEmergencyContacts(emergency_contacts);

    const activeSosResult = await client.query(
      `
      SELECT *
      FROM sos_alerts
      WHERE device_id = $1
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [deviceId]
    );

    if (activeSosResult.rows.length > 0) {
      const activeSos = activeSosResult.rows[0];

      return res.status(200).json({
        success: true,
        alreadyActive: true,
        message: "SOS is already active for this device.",
        sos: activeSos,
        publicToken: activeSos.public_token,
        trackingLink: buildTrackingLink(activeSos.public_token),
      });
    }

    const publicToken = crypto.randomBytes(32).toString("hex");

    await client.query("BEGIN");

    const sosResult = await client.query(
      `
      INSERT INTO sos_alerts (
        device_id,
        trigger_type,
        latitude,
        longitude,
        risk_score,
        status,
        public_token
      )
      VALUES ($1, $2, $3, $4, $5, 'active', $6)
      RETURNING *
      `,
      [
        deviceId,
        trigger_type,
        latitude,
        longitude,
        risk_score,
        publicToken,
      ]
    );

    const sos = sosResult.rows[0];

    await client.query(
      `
      INSERT INTO sos_location_updates (
        sos_alert_id,
        latitude,
        longitude
      )
      VALUES ($1, $2, $3)
      `,
      [sos.id, latitude, longitude]
    );

    const nearestPoliceStation = await findNearestPoliceStation(
      client,
      latitude,
      longitude
    );

    await client.query("COMMIT");

    const trackingLink = buildTrackingLink(publicToken);
    const googleMapsLink = buildGoogleMapsLink(latitude, longitude);
    const riskLevel = calculateRiskLevel(risk_score);

    const aiMessage = generateEmergencyMessage({
      userName: user_name || "App User",
      latitude,
      longitude,
      district,
      riskLevel,
      riskScore: risk_score,
      trackingLink,
      triggerType: trigger_type,
      timestamp: new Date().toISOString(),
    });

    console.log("AI Emergency Message:\n", aiMessage);
    console.log("Emergency Contacts:", contacts);
    console.log("Nearest Police:", nearestPoliceStation);

    /*
      This emits to the public tracking page room.
      Your tracking page joins this room using publicToken.
    */
    io.to(publicToken).emit("sos_started", {
      sosId: sos.id,
      publicToken,
      trackingLink,
      latitude,
      longitude,
      status: "active",
      recorded_at: sos.created_at,
    });

    /*
      This emits ONLY the initial SOS alert to nearest police dashboard.
      Police dashboard should join room: police_<policeStationId>

      Police then opens trackingLink to see live updates.
      We are NOT saving police_station_id in sos_alerts.
    */
    if (nearestPoliceStation?.id) {
      io.to(`police_${nearestPoliceStation.id}`).emit("new_sos_alert", {
        sosId: sos.id,
        publicToken,
        trackingLink,
        googleMapsLink,
        latitude,
        longitude,
        triggerType: trigger_type,
        riskScore: risk_score,
        riskLevel,
        status: "active",
        recordedAt: sos.created_at,
        policeStation: nearestPoliceStation,
        emergencyContacts: contacts,
        message: aiMessage,
      });
    }

    return res.status(201).json({
      success: true,
      message: "SOS started successfully",
      sos,
      publicToken,
      trackingLink,
      googleMapsLink,
      emergency_contacts: contacts,
      nearest_police_station: nearestPoliceStation,
      ai_message: aiMessage,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("Start SOS error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

export const updateSosLocation = async (req, res) => {
  try {
    const { sosId } = req.params;
    const deviceId = req.deviceId;
    const { latitude, longitude } = req.body;

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

    const sosResult = await pool.query(
      `
      SELECT id, public_token, status
      FROM sos_alerts
      WHERE id = $1
        AND device_id = $2
      `,
      [sosId, deviceId]
    );

    if (sosResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "SOS not found for this device",
      });
    }

    const sos = sosResult.rows[0];

    if (sos.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "SOS is not active",
      });
    }

    const locationResult = await pool.query(
      `
      INSERT INTO sos_location_updates (
        sos_alert_id,
        latitude,
        longitude
      )
      VALUES ($1, $2, $3)
      RETURNING latitude, longitude, recorded_at
      `,
      [sosId, latitude, longitude]
    );

    const latestLocation = locationResult.rows[0];

    /*
      Only tracking page receives live location updates.
      Police dashboard does NOT need live updates directly.
      Police opens trackingLink and sees updates there.
    */
    io.to(sos.public_token).emit("location_update", {
      latitude: latestLocation.latitude,
      longitude: latestLocation.longitude,
      recorded_at: latestLocation.recorded_at,
    });

    return res.status(200).json({
      success: true,
      message: "Location updated",
      location: latestLocation,
    });
  } catch (error) {
    console.error("Update SOS location error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getTrackingLocation = async (req, res) => {
  try {
    const { publicToken } = req.params;

    const result = await pool.query(
      `
      SELECT
        sa.id,
        sa.status,
        sa.created_at,
        sa.resolved_at,
        slu.latitude,
        slu.longitude,
        slu.recorded_at
      FROM sos_alerts sa
      JOIN LATERAL (
        SELECT latitude, longitude, recorded_at
        FROM sos_location_updates
        WHERE sos_alert_id = sa.id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) slu ON true
      WHERE sa.public_token = $1
      `,
      [publicToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tracking link not found",
      });
    }

    return res.status(200).json({
      success: true,
      tracking: result.rows[0],
    });
  } catch (error) {
    console.error("Get tracking error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const resolveSos = async (req, res) => {
  try {
    const { sosId } = req.params;
    const deviceId = req.deviceId;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
      });
    }

    const result = await pool.query(
      `
      UPDATE sos_alerts
      SET status = 'resolved',
          resolved_at = NOW()
      WHERE id = $1
        AND device_id = $2
        AND status = 'active'
      RETURNING *
      `,
      [sosId, deviceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Active SOS not found for this device",
      });
    }

    const sos = result.rows[0];

    io.to(sos.public_token).emit("sos_resolved", {
      status: "resolved",
      resolved_at: sos.resolved_at,
    });

    return res.status(200).json({
      success: true,
      message: "SOS resolved",
      sos,
    });
  } catch (error) {
    console.error("Resolve SOS error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getIncidentReport = async (req, res) => {
  const client = await pool.connect();

  try {
    const { sosId } = req.params;
    const deviceId = req.deviceId;

    const sosResult = await client.query(
      `
      SELECT *
      FROM sos_alerts
      WHERE id = $1
        AND device_id = $2
      `,
      [sosId, deviceId]
    );

    if (sosResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "SOS not found",
      });
    }

    const sos = sosResult.rows[0];

    const locationResult = await client.query(
      `
      SELECT latitude, longitude, recorded_at
      FROM sos_location_updates
      WHERE sos_alert_id = $1
      ORDER BY recorded_at ASC
      `,
      [sosId]
    );

    const locationHistory = locationResult.rows;
    const trackingLink = buildTrackingLink(sos.public_token);

    const durationMinutes = sos.resolved_at
      ? Math.round(
          (new Date(sos.resolved_at) - new Date(sos.created_at)) / 60000
        )
      : 0;

    const riskLevel = calculateRiskLevel(sos.risk_score);

    const reportText = generateIncidentReport({
      userName: sos.user_name || "App User",
      sosId: sos.id,
      startTime: sos.created_at,
      endTime: sos.resolved_at || new Date().toISOString(),
      district: sos.district || "Dhaka",
      locationHistory,
      riskScore: sos.risk_score,
      triggerType: sos.trigger_type,
      trackingLink,
    });

    const existingReport = await client.query(
      `
      SELECT id
      FROM incident_reports
      WHERE sos_alert_id = $1
      `,
      [sosId]
    );

    let savedReport;

    if (existingReport.rows.length > 0) {
      const updateResult = await client.query(
        `
        UPDATE incident_reports
        SET report_text = $1,
            generated_at = NOW()
        WHERE sos_alert_id = $2
        RETURNING *
        `,
        [reportText, sosId]
      );

      savedReport = updateResult.rows[0];
      console.log("Incident report updated in DB:", savedReport.id);
    } else {
      const insertResult = await client.query(
        `
        INSERT INTO incident_reports (
          sos_alert_id,
          device_id,
          report_text,
          district,
          latitude,
          longitude,
          risk_score,
          risk_level,
          trigger_type,
          duration_minutes,
          location_points_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        `,
        [
          sosId,
          deviceId,
          reportText,
          sos.district || "Dhaka",
          sos.latitude,
          sos.longitude,
          sos.risk_score,
          riskLevel,
          sos.trigger_type,
          durationMinutes,
          locationHistory.length,
        ]
      );

      savedReport = insertResult.rows[0];
      console.log("Incident report saved to DB:", savedReport.id);
    }

    return res.status(200).json({
      success: true,
      report: reportText,
      report_id: savedReport.id,
      generated_at: savedReport.generated_at,
    });
  } catch (error) {
    console.error("Incident report error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate incident report",
      error: error.message,
    });
  } finally {
    client.release();
  }
};