ALTER TABLE anonymous_devices
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT NOW();

ALTER TABLE anonymous_devices
ADD CONSTRAINT unique_device_id UNIQUE (device_id);