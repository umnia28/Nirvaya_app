-- Incident reports table
CREATE TABLE IF NOT EXISTS incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_alert_id UUID NOT NULL REFERENCES sos_alerts(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES anonymous_devices(device_id) ON DELETE CASCADE,
  report_text TEXT NOT NULL,
  district TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  risk_score NUMERIC(5,2),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  trigger_type TEXT CHECK (trigger_type IN ('button', 'voice', 'auto_stationary')),
  duration_minutes INTEGER,
  location_points_count INTEGER,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by device
CREATE INDEX IF NOT EXISTS idx_incident_reports_device_id
  ON incident_reports(device_id);

-- Index for fast lookup by sos alert
CREATE INDEX IF NOT EXISTS idx_incident_reports_sos_alert_id
  ON incident_reports(sos_alert_id);

-- Index for model retraining queries (by district + risk)
CREATE INDEX IF NOT EXISTS idx_incident_reports_district_risk
  ON incident_reports(district, risk_level);

-- Also add trigger_type auto_stationary to sos_alerts
ALTER TABLE sos_alerts
  DROP CONSTRAINT IF EXISTS sos_alerts_trigger_type_check;

ALTER TABLE sos_alerts
  ADD CONSTRAINT sos_alerts_trigger_type_check
  CHECK (trigger_type IN ('button', 'voice', 'auto_stationary'));

-- Also add district column to sos_alerts for easier querying
ALTER TABLE sos_alerts
  ADD COLUMN IF NOT EXISTS district TEXT DEFAULT 'Dhaka';

-- Also add user_name column to sos_alerts
ALTER TABLE sos_alerts
  ADD COLUMN IF NOT EXISTS user_name TEXT;



  /*Run it against your database:
   psql -U your_db_user -d your_db_name -f server/migrations/add_incident_reports.sql

   Or if you use a connection string:
   psql "your_connection_string" -f server/migrations/add_incident_reports.sql
   */

   /*Restart backend:
   */

   /* Test it — trigger and resolve an SOS from the frontend, then check:
   
   SELECT * FROM incident_reports;

   You should see a new row with the full report text saved automatically.
   */
