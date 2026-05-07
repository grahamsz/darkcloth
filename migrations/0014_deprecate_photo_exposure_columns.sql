-- Deprecate per-photo ISO and exposure compensation from the active photographs row.
--
-- This migration keeps historical values in a dedicated legacy table while removing
-- them from the primary persistence model used by current API reads/writes.

CREATE TABLE IF NOT EXISTS photograph_exposure_legacy (
  photograph_id TEXT PRIMARY KEY REFERENCES photographs(id) ON DELETE CASCADE,
  iso INTEGER,
  exposure_compensation TEXT,
  archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO photograph_exposure_legacy (photograph_id, iso, exposure_compensation)
SELECT id, iso, exposure_compensation
FROM photographs;

ALTER TABLE photographs RENAME TO photographs_deprecated;

CREATE TABLE photographs_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roll_id TEXT REFERENCES rolls(id) ON DELETE SET NULL,
  camera_id TEXT REFERENCES cameras(id) ON DELETE SET NULL,
  lens_id TEXT REFERENCES lenses(id) ON DELETE SET NULL,
  film_id TEXT REFERENCES films(id) ON DELETE SET NULL,
  frame_number TEXT,
  taken_at TEXT,
  aperture TEXT,
  shutter_speed TEXT,
  shutter_speed_seconds REAL,
  focal_length_mm REAL,
  latitude REAL,
  longitude REAL,
  altitude_m REAL,
  gps_accuracy_m REAL,
  notes TEXT,
  film_holder_id TEXT REFERENCES film_holders(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO photographs_new (
  id,
  user_id,
  roll_id,
  camera_id,
  lens_id,
  film_id,
  frame_number,
  taken_at,
  aperture,
  shutter_speed,
  shutter_speed_seconds,
  focal_length_mm,
  latitude,
  longitude,
  altitude_m,
  gps_accuracy_m,
  notes,
  film_holder_id,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  roll_id,
  camera_id,
  lens_id,
  film_id,
  frame_number,
  taken_at,
  aperture,
  shutter_speed,
  shutter_speed_seconds,
  focal_length_mm,
  latitude,
  longitude,
  altitude_m,
  gps_accuracy_m,
  notes,
  film_holder_id,
  created_at,
  updated_at
FROM photographs_deprecated;

DROP TABLE photographs_deprecated;
ALTER TABLE photographs_new RENAME TO photographs;
