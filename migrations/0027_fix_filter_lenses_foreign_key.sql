-- Fix filter_lenses foreign key reference after filter table migration.
-- The prior filter migration renamed filters to filters_legacy and recreated filters,
-- but left filter_lenses pointing at the legacy table.

PRAGMA foreign_keys = OFF;

ALTER TABLE filter_lenses RENAME TO filter_lenses_legacy;

CREATE TABLE filter_lenses (
  filter_id TEXT NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
  lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (filter_id, lens_id)
);

INSERT INTO filter_lenses (filter_id, lens_id, user_id, created_at)
SELECT filter_id, lens_id, user_id, created_at
FROM filter_lenses_legacy;

DROP TABLE filter_lenses_legacy;

CREATE INDEX IF NOT EXISTS idx_filter_lenses_user_filter ON filter_lenses(user_id, filter_id);
CREATE INDEX IF NOT EXISTS idx_filter_lenses_filter ON filter_lenses(filter_id);
CREATE INDEX IF NOT EXISTS idx_filter_lenses_user_lens ON filter_lenses(user_id, lens_id);
CREATE INDEX IF NOT EXISTS idx_filter_lenses_lens ON filter_lenses(lens_id);

PRAGMA foreign_keys = ON;
