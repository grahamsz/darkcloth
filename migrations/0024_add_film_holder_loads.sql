-- Persist film holder load lifecycle/history for sheet film holders.
-- Existing photographs continue to store film_holder_id directly; this table tracks
-- load-level state and processing history.

CREATE TABLE IF NOT EXISTS film_holder_loads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  film_holder_id TEXT NOT NULL,
  film_id TEXT,
  status TEXT NOT NULL DEFAULT 'loaded'
    CHECK (status IN ('loaded', 'exposed', 'processed')),
  loaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exposed_at TEXT,
  exposed_photograph_id TEXT,
  processed_at TEXT,
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
    (status = 'loaded' AND exposed_photograph_id IS NULL)
    OR (status IN ('exposed', 'processed') AND exposed_photograph_id IS NOT NULL)
  ),
  CHECK (
    (status = 'loaded' AND exposed_at IS NULL AND processed_at IS NULL)
    OR (status = 'exposed' AND exposed_at IS NOT NULL AND processed_at IS NULL)
    OR (status = 'processed' AND exposed_at IS NOT NULL AND processed_at IS NOT NULL)
  )
);

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
