-- Migrate legacy text filter factors to numeric storage for deterministic exposure math.
--
-- Backfill behavior:
-- - Pure numeric strings are cast to REAL.
-- - Range-like strings containing a single "-" are converted to the midpoint
--   of the numeric endpoints (e.g., "1.5-2" -> 1.75).
-- - Unparseable, empty, or non-positive values are set to 1.

PRAGMA foreign_keys = OFF;

ALTER TABLE filters RENAME TO filters_legacy;

CREATE TABLE filters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  filter_factor REAL NOT NULL,
  source TEXT,
  standard_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO filters (id, user_id, name, code, filter_factor, source, standard_key, created_at, updated_at)
WITH normalized AS (
  SELECT
    id,
    user_id,
    name,
    code,
    source,
    standard_key,
    created_at,
    updated_at,
    TRIM(filter_factor) AS filter_factor_raw
  FROM filters_legacy
),
parsed AS (
  SELECT
    id,
    user_id,
    name,
    code,
    source,
    standard_key,
    created_at,
    updated_at,
    filter_factor_raw,
    CASE
      WHEN filter_factor_raw LIKE '%-%' THEN 1
      ELSE 0
    END AS is_range,
    CAST(NULLIF(TRIM(SUBSTR(filter_factor_raw, 1, INSTR(filter_factor_raw, '-') - 1)), '') AS REAL) AS range_min,
    CAST(NULLIF(TRIM(SUBSTR(filter_factor_raw, INSTR(filter_factor_raw, '-') + 1)), '') AS REAL) AS range_max,
    CAST(NULLIF(filter_factor_raw, '') AS REAL) AS scalar_factor
FROM normalized
)
SELECT
  id,
  user_id,
  name,
  code,
  CASE
    WHEN is_range = 1 THEN
      CASE
        WHEN range_min > 0 AND range_max > 0 THEN (range_min + range_max) / 2.0
        WHEN range_min > 0 THEN range_min
        WHEN range_max > 0 THEN range_max
        ELSE 1
      END
    WHEN scalar_factor > 0 THEN scalar_factor
    ELSE 1
  END AS filter_factor,
  source,
  standard_key,
  created_at,
  updated_at
FROM parsed;

DROP TABLE filters_legacy;

CREATE INDEX IF NOT EXISTS idx_filters_user ON filters(user_id);

PRAGMA foreign_keys = ON;
