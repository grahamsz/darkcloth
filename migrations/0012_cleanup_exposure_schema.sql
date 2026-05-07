-- Finalize exposure-logging transport and shutter semantics.
--
-- - Rebuild cameras without the deprecated camera-level film_holders_id linkage.
-- - Normalize explicit shutter ownership flags for cameras and lenses:
--   roll cameras default on, sheet cameras default off.
-- - Enforce "no shutter" gear to keep null shutter ranges and supports_bulb = 0.
-- - Preserve per-photo iso and exposure_compensation columns for historical compatibility.

DROP INDEX IF EXISTS idx_cameras_film_holders;

ALTER TABLE cameras RENAME TO cameras_deprecated;

CREATE TABLE cameras_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  maker TEXT,
  film_type TEXT CHECK (film_type IN ('sheet', 'roll', '')),
  has_shutter INTEGER NOT NULL DEFAULT 0,
  min_shutter_speed_seconds REAL,
  max_shutter_speed_seconds REAL,
  supports_bulb INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO cameras_new (
  id,
  user_id,
  name,
  maker,
  film_type,
  has_shutter,
  min_shutter_speed_seconds,
  max_shutter_speed_seconds,
  supports_bulb,
  created_at
)
SELECT
  id,
  user_id,
  name,
  maker,
  film_type,
  CASE
    WHEN film_type = 'roll' THEN 1
    WHEN film_type = 'sheet' THEN 0
    WHEN min_shutter_speed_seconds IS NOT NULL OR max_shutter_speed_seconds IS NOT NULL OR supports_bulb = 1 THEN 1
    ELSE 0
  END AS has_shutter_inferred,
  CASE
    WHEN (
      CASE
        WHEN film_type = 'roll' THEN 1
        WHEN film_type = 'sheet' THEN 0
        WHEN min_shutter_speed_seconds IS NOT NULL OR max_shutter_speed_seconds IS NOT NULL OR supports_bulb = 1 THEN 1
        ELSE 0
      END
    ) = 1
    THEN min_shutter_speed_seconds
    ELSE NULL
  END AS min_shutter_speed_seconds,
  CASE
    WHEN (
      CASE
        WHEN film_type = 'roll' THEN 1
        WHEN film_type = 'sheet' THEN 0
        WHEN min_shutter_speed_seconds IS NOT NULL OR max_shutter_speed_seconds IS NOT NULL OR supports_bulb = 1 THEN 1
        ELSE 0
      END
    ) = 1
    THEN max_shutter_speed_seconds
    ELSE NULL
  END AS max_shutter_speed_seconds,
  CASE
    WHEN (
      CASE
        WHEN film_type = 'roll' THEN 1
        WHEN film_type = 'sheet' THEN 0
        WHEN min_shutter_speed_seconds IS NOT NULL OR max_shutter_speed_seconds IS NOT NULL OR supports_bulb = 1 THEN 1
        ELSE 0
      END
    ) = 1
    THEN supports_bulb
    ELSE 0
  END AS supports_bulb,
  created_at
FROM cameras_deprecated;

DROP TABLE cameras_deprecated;
ALTER TABLE cameras_new RENAME TO cameras;

CREATE INDEX IF NOT EXISTS idx_cameras_user ON cameras(user_id);
CREATE INDEX IF NOT EXISTS idx_cameras_film_type ON cameras(film_type);

WITH lens_shutter_flags AS (
  SELECT
    id,
    CASE
      WHEN min_shutter_speed_seconds IS NOT NULL OR max_shutter_speed_seconds IS NOT NULL OR supports_bulb = 1 THEN 1
      ELSE 0
    END AS has_shutter_inferred
  FROM lenses
)
UPDATE lenses
SET
  has_shutter = lens_shutter_flags.has_shutter_inferred,
  min_shutter_speed_seconds = CASE
    WHEN lens_shutter_flags.has_shutter_inferred = 1 THEN min_shutter_speed_seconds
    ELSE NULL
  END,
  max_shutter_speed_seconds = CASE
    WHEN lens_shutter_flags.has_shutter_inferred = 1 THEN max_shutter_speed_seconds
    ELSE NULL
  END,
  supports_bulb = CASE
    WHEN lens_shutter_flags.has_shutter_inferred = 1 THEN supports_bulb
    ELSE 0
  END
FROM lens_shutter_flags
WHERE lenses.id = lens_shutter_flags.id;
