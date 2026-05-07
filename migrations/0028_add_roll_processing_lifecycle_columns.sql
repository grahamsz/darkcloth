-- Extend roll lifecycle persistence for finished/processed workflow state.
--
-- This migration preserves legacy `developed_at` and keeps a compatibility
-- status alias of `developed` while introducing persisted finished/processed
-- fields for new workflow stages.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS rolls_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  film_id TEXT REFERENCES films(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  loaded_at TEXT,
  developed_at TEXT,
  finished_at TEXT,
  processed_at TEXT,
  push_pull_stops INTEGER NOT NULL DEFAULT 0 CHECK (push_pull_stops BETWEEN -3 AND 3),
  status TEXT NOT NULL DEFAULT 'unexposed'
    CHECK (status IN ('unexposed', 'exposing', 'finished', 'processed', 'developed')),
  roll_format TEXT CHECK (
    roll_format IS NULL OR roll_format IN ('35mm', '120', '220', '127', '620')
  ),
  development_profile_id TEXT REFERENCES development_profiles(id) ON DELETE SET NULL,
  development_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO rolls_new (
  id,
  user_id,
  film_id,
  name,
  loaded_at,
  developed_at,
  finished_at,
  processed_at,
  push_pull_stops,
  status,
  roll_format,
  development_profile_id,
  development_notes,
  created_at
)
SELECT
  id,
  user_id,
  film_id,
  name,
  loaded_at,
  developed_at,
  NULL,
  developed_at AS processed_at,
  push_pull_stops,
  CASE
    WHEN developed_at IS NOT NULL THEN 'processed'
    WHEN status = 'developed' THEN 'developed'
    WHEN EXISTS (
      SELECT 1
      FROM photographs
      WHERE roll_id = rolls.id
    ) THEN 'exposing'
    ELSE status
  END,
  roll_format,
  NULL,
  NULL,
  created_at
FROM rolls;

DROP TABLE rolls;
ALTER TABLE rolls_new RENAME TO rolls;

CREATE INDEX IF NOT EXISTS idx_rolls_user ON rolls(user_id);
CREATE INDEX IF NOT EXISTS idx_rolls_user_status ON rolls(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rolls_user_status_created_at ON rolls(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_rolls_roll_format ON rolls(roll_format);
CREATE INDEX IF NOT EXISTS idx_rolls_user_roll_format ON rolls(user_id, roll_format);
CREATE INDEX IF NOT EXISTS idx_photographs_roll ON photographs(roll_id);
CREATE INDEX IF NOT EXISTS idx_photographs_user_roll_frame_date
  ON photographs(user_id, roll_id, frame_number, created_at);
CREATE INDEX IF NOT EXISTS idx_photographs_user_roll_taken_date
  ON photographs(user_id, roll_id, taken_at);

PRAGMA foreign_keys = ON;
