-- Expand film stock categories while preserving existing stored values.
--
-- Existing `bw` rows now display as B&W Negative in the app. The storage value
-- stays `bw` so existing BTZS/profile logic and historical data remain stable.
--
-- D1 may still apply ON DELETE actions while rebuilding a referenced parent
-- table, even when this migration requests PRAGMA foreign_keys = OFF. Back up
-- child film references before dropping `films`, then restore them after the
-- new parent table is in place.

DROP TABLE IF EXISTS _migration_0033_photograph_film_refs;
DROP TABLE IF EXISTS _migration_0033_roll_film_refs;
DROP TABLE IF EXISTS _migration_0033_film_holder_load_refs;
DROP TABLE IF EXISTS _migration_0033_development_profiles_backup;

CREATE TABLE _migration_0033_photograph_film_refs AS
SELECT id, film_id
FROM photographs
WHERE film_id IS NOT NULL;

CREATE TABLE _migration_0033_roll_film_refs AS
SELECT id, film_id
FROM rolls
WHERE film_id IS NOT NULL;

CREATE TABLE _migration_0033_film_holder_load_refs AS
SELECT id, film_id
FROM film_holder_loads
WHERE film_id IS NOT NULL;

CREATE TABLE _migration_0033_development_profiles_backup AS
SELECT *
FROM development_profiles;

PRAGMA foreign_keys = OFF;

CREATE TABLE films_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  iso INTEGER,
  process TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stock_type TEXT NOT NULL DEFAULT 'other'
    CHECK (stock_type IN (
      'color_negative',
      'bw',
      'color_slide',
      'bw_slide',
      'color_infrared',
      'bw_infrared',
      'other'
    )),
  reciprocity_p_factor REAL NOT NULL DEFAULT 1 CHECK (reciprocity_p_factor > 0)
);

INSERT INTO films_new (
  id,
  user_id,
  name,
  iso,
  process,
  created_at,
  stock_type,
  reciprocity_p_factor
)
SELECT
  id,
  user_id,
  name,
  iso,
  process,
  created_at,
  stock_type,
  reciprocity_p_factor
FROM films;

DROP TABLE films;

ALTER TABLE films_new RENAME TO films;

CREATE INDEX IF NOT EXISTS idx_films_stock_type ON films(stock_type);

PRAGMA foreign_keys = ON;

INSERT INTO development_profiles
SELECT *
FROM _migration_0033_development_profiles_backup
WHERE id NOT IN (SELECT id FROM development_profiles);

UPDATE photographs
SET film_id = (
  SELECT refs.film_id
  FROM _migration_0033_photograph_film_refs refs
  WHERE refs.id = photographs.id
)
WHERE id IN (SELECT id FROM _migration_0033_photograph_film_refs);

UPDATE rolls
SET film_id = (
  SELECT refs.film_id
  FROM _migration_0033_roll_film_refs refs
  WHERE refs.id = rolls.id
)
WHERE id IN (SELECT id FROM _migration_0033_roll_film_refs);

UPDATE film_holder_loads
SET film_id = (
  SELECT refs.film_id
  FROM _migration_0033_film_holder_load_refs refs
  WHERE refs.id = film_holder_loads.id
)
WHERE id IN (SELECT id FROM _migration_0033_film_holder_load_refs);

DROP TABLE _migration_0033_photograph_film_refs;
DROP TABLE _migration_0033_roll_film_refs;
DROP TABLE _migration_0033_film_holder_load_refs;
DROP TABLE _migration_0033_development_profiles_backup;
