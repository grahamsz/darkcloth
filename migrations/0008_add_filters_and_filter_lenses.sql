CREATE TABLE IF NOT EXISTS filters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  filter_factor TEXT NOT NULL,
  source TEXT,
  standard_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- An empty set of rows in filter_lenses indicates a filter applies to all lenses.
CREATE TABLE IF NOT EXISTS filter_lenses (
  filter_id TEXT NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
  lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (filter_id, lens_id)
);

CREATE INDEX IF NOT EXISTS idx_filters_user ON filters(user_id);
CREATE INDEX IF NOT EXISTS idx_filter_lenses_user_filter ON filter_lenses(user_id, filter_id);
CREATE INDEX IF NOT EXISTS idx_filter_lenses_filter ON filter_lenses(filter_id);
CREATE INDEX IF NOT EXISTS idx_filter_lenses_user_lens ON filter_lenses(user_id, lens_id);
CREATE INDEX IF NOT EXISTS idx_filter_lenses_lens ON filter_lenses(lens_id);
