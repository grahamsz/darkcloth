-- Final pass for exposure logging schema semantics.
--
-- This migration ensures shutter ownership flags and effective shutter data remain
-- consistent across existing rows after the earlier exposure migrations.

WITH camera_shutter_flags AS (
  SELECT
    id,
    CASE
      WHEN film_type = 'roll' THEN 1
      WHEN film_type = 'sheet' THEN 0
      WHEN min_shutter_speed_seconds IS NOT NULL OR max_shutter_speed_seconds IS NOT NULL OR supports_bulb = 1 THEN 1
      ELSE 0
    END AS has_shutter_inferred
  FROM cameras
)
UPDATE cameras
SET
  has_shutter = camera_shutter_flags.has_shutter_inferred,
  min_shutter_speed_seconds = CASE
    WHEN camera_shutter_flags.has_shutter_inferred = 1 THEN min_shutter_speed_seconds
    ELSE NULL
  END,
  max_shutter_speed_seconds = CASE
    WHEN camera_shutter_flags.has_shutter_inferred = 1 THEN max_shutter_speed_seconds
    ELSE NULL
  END,
  supports_bulb = CASE
    WHEN camera_shutter_flags.has_shutter_inferred = 1 THEN supports_bulb
    ELSE 0
  END
FROM camera_shutter_flags
WHERE cameras.id = camera_shutter_flags.id;

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

-- Backfill calculation-friendly shutter seconds where photo shutter_speed is parseable and missing.
WITH normalized AS (
  SELECT
    id,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(lower(trim(shutter_speed)), ' ', ''), 'sec', ''), 'seconds', ''), 's', ''), '"', '') AS normalized_speed
  FROM photographs
  WHERE shutter_speed IS NOT NULL AND trim(shutter_speed) <> '' AND (shutter_speed_seconds IS NULL OR shutter_speed_seconds = 0)
),
shutter_parsed AS (
  SELECT
    id,
    normalized_speed,
    instr(normalized_speed, '/') AS slash_pos,
    CASE
      WHEN instr(normalized_speed, '/') > 0 THEN CAST(substr(normalized_speed, 1, instr(normalized_speed, '/') - 1) AS REAL)
      ELSE NULL
    END AS slash_numerator,
    CASE
      WHEN instr(normalized_speed, '/') > 0 THEN CAST(substr(normalized_speed, instr(normalized_speed, '/') + 1) AS REAL)
      ELSE NULL
    END AS slash_denominator,
    CASE
      WHEN CAST(normalized_speed AS REAL) > 0 THEN CAST(normalized_speed AS REAL)
      ELSE NULL
    END AS numeric_seconds
  FROM normalized
)
UPDATE photographs
SET shutter_speed_seconds = CASE
  WHEN slash_pos > 0 AND slash_numerator > 0 AND slash_denominator > 0 THEN slash_numerator / slash_denominator
  WHEN numeric_seconds IS NOT NULL THEN numeric_seconds
  ELSE NULL
END
FROM shutter_parsed
WHERE photographs.id = shutter_parsed.id;
