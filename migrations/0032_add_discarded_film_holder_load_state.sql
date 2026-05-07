-- Add a durable discarded state for film holder loads.
-- Existing states remain loaded -> exposed -> processed, while discarded loads are treated
-- as historical and therefore never eligible for active-load constraints.

PRAGMA foreign_keys = OFF;

ALTER TABLE film_holder_loads RENAME TO film_holder_loads_deprecated;

CREATE TABLE film_holder_loads_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  film_holder_id TEXT NOT NULL,
  film_id TEXT,
  status TEXT NOT NULL DEFAULT 'loaded'
    CHECK (status IN ('loaded', 'exposed', 'processed', 'discarded')),
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exposed_at TEXT,
  exposed_photograph_id TEXT,
  processed_at TEXT,
  discarded_at TEXT,
  discarded_reason TEXT,
  development_profile_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id, film_holder_id) REFERENCES film_holders(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE SET NULL,
  FOREIGN KEY (exposed_photograph_id) REFERENCES photographs(id) ON DELETE SET NULL,
  FOREIGN KEY (development_profile_id) REFERENCES development_profiles(id) ON DELETE SET NULL,

  CHECK (exposed_at IS NULL OR exposed_at >= loaded_at),
  CHECK (processed_at IS NULL OR exposed_at IS NOT NULL),
  CHECK (processed_at IS NULL OR processed_at >= exposed_at),
  CHECK (
    (status = 'discarded' AND discarded_at IS NOT NULL)
    OR (status IN ('loaded', 'exposed', 'processed') AND discarded_at IS NULL)
  ),
  CHECK (
    (status = 'loaded' AND exposed_photograph_id IS NULL)
    OR status = 'discarded'
    OR (status IN ('exposed', 'processed') AND exposed_photograph_id IS NOT NULL)
  ),
  CHECK (
    (status = 'loaded' AND exposed_at IS NULL AND processed_at IS NULL)
    OR (status = 'exposed' AND exposed_at IS NOT NULL AND processed_at IS NULL)
    OR (status = 'processed' AND exposed_at IS NOT NULL AND processed_at IS NOT NULL)
    OR (status = 'discarded' AND processed_at IS NULL)
  )
);

INSERT INTO film_holder_loads_new (
  id,
  user_id,
  film_holder_id,
  film_id,
  status,
  loaded_at,
  exposed_at,
  exposed_photograph_id,
  processed_at,
  discarded_at,
  discarded_reason,
  development_profile_id,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  film_holder_id,
  film_id,
  status,
  loaded_at,
  exposed_at,
  exposed_photograph_id,
  processed_at,
  NULL,
  NULL,
  development_profile_id,
  notes,
  created_at,
  updated_at
FROM film_holder_loads_deprecated;

DROP TABLE film_holder_loads_deprecated;
ALTER TABLE film_holder_loads_new RENAME TO film_holder_loads;

CREATE INDEX IF NOT EXISTS idx_film_holder_loads_user_holder
  ON film_holder_loads (user_id, film_holder_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_film_holder_loads_user_holder_active
  ON film_holder_loads (user_id, film_holder_id)
  WHERE status IN ('loaded', 'exposed');

CREATE INDEX IF NOT EXISTS idx_film_holder_loads_user_holder_status
  ON film_holder_loads (user_id, film_holder_id, status);

CREATE INDEX IF NOT EXISTS idx_film_holder_loads_user_film
  ON film_holder_loads (user_id, film_id);

CREATE INDEX IF NOT EXISTS idx_film_holder_loads_exposed_photograph
  ON film_holder_loads (exposed_photograph_id);

PRAGMA foreign_keys = ON;
