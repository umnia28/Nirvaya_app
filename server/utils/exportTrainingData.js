// server/utils/exportTrainingData.js

/*When you want to use incident reports to improve your risk model, run this query to export training data:*/
import pool from "../config/db.js";
import fs from "fs";

export const exportIncidentDataForTraining = async () => {
  const result = await pool.query(
    `SELECT
      ir.latitude,
      ir.longitude,
      ir.district,
      ir.risk_score,
      ir.risk_level,
      ir.trigger_type,
      ir.duration_minutes,
      EXTRACT(HOUR FROM sa.created_at AT TIME ZONE 'Asia/Dhaka') AS hour,
      EXTRACT(DOW FROM sa.created_at AT TIME ZONE 'Asia/Dhaka') AS day_of_week,
      sa.created_at
     FROM incident_reports ir
     JOIN sos_alerts sa ON ir.sos_alert_id = sa.id
     WHERE ir.risk_level IS NOT NULL
     ORDER BY sa.created_at DESC`
  );

  const csvLines = [
    "latitude,longitude,district,risk_score,risk_level,hour,day_of_week",
    ...result.rows.map(
      (r) =>
        `${r.latitude},${r.longitude},${r.district},${r.risk_score},${r.risk_level},${r.hour},${r.day_of_week}`
    ),
  ];

  fs.writeFileSync("incident_training_data.csv", csvLines.join("\n"));
  console.log(
    `Exported ${result.rows.length} incident records to incident_training_data.csv`
  );

  return result.rows;
};