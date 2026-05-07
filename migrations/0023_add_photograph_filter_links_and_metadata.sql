-- Add richer filter metadata and support ordered, per-photo filter stacks.
-- Existing filter-lens compatibility semantics are unchanged: an empty filter_lenses set
-- still means "applies to all lenses".

ALTER TABLE filters
  ADD COLUMN maker TEXT;

ALTER TABLE filters
  ADD COLUMN category TEXT;

ALTER TABLE filters
  ADD COLUMN size TEXT;

ALTER TABLE filters
  ADD COLUMN thread_size TEXT;

ALTER TABLE filters
  ADD COLUMN size_system TEXT;

ALTER TABLE filters
  ADD COLUMN notes TEXT;

-- `position` is the stack order for a given photograph (0-based, lower first).
-- Lower values should be rendered/applied first.
CREATE TABLE IF NOT EXISTS photograph_filters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photograph_id TEXT NOT NULL REFERENCES photographs(id) ON DELETE CASCADE,
  filter_id TEXT NOT NULL REFERENCES filters(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, photograph_id, filter_id),
  UNIQUE (user_id, photograph_id, position),
  UNIQUE (user_id, filter_id, photograph_id)
);

CREATE INDEX IF NOT EXISTS idx_photograph_filters_user_photograph
  ON photograph_filters(user_id, photograph_id, position);

CREATE INDEX IF NOT EXISTS idx_photograph_filters_user_filter
  ON photograph_filters(user_id, filter_id);

CREATE INDEX IF NOT EXISTS idx_photograph_filters_filter
  ON photograph_filters(filter_id);
