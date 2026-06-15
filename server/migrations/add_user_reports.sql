
CREATE TABLE IF NOT EXISTS user_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   TEXT NOT NULL
                REFERENCES anonymous_devices(device_id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN (
                'stalking',
                'eve_teasing',
                'suspicious_person',
                'snatching',
                'poor_lighting',
                'other'
              )),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  latitude    NUMERIC(9,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude   NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  district    TEXT DEFAULT 'Dhaka',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bounding-box lookups for the heatmap / "reports near me"
CREATE INDEX IF NOT EXISTS idx_user_reports_lat_lng
  ON user_reports (latitude, longitude);

-- Analytics / risk-model retraining (by area + type)
CREATE INDEX IF NOT EXISTS idx_user_reports_district_category
  ON user_reports (district, category);

-- Recent-first queries
CREATE INDEX IF NOT EXISTS idx_user_reports_created_at
  ON user_reports (created_at DESC);


