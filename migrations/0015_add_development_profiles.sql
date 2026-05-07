-- Add development profile persistence for film emulsions.
--
-- This table captures both simple and BTZS workflows. Values are stored as text
-- to preserve source formatting and avoid numeric parsing at the database layer.

CREATE TABLE IF NOT EXISTS development_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  profile_type TEXT NOT NULL CHECK (profile_type IN ('simple', 'btzs')),
  name TEXT,
  developer_name TEXT,
  dilution TEXT,
  temperature_text TEXT,
  agitation TEXT,
  notes TEXT,
  time_text TEXT,
  film_iso TEXT,
  test_date TEXT,
  curves_text TEXT,
  flare_density_text TEXT,
  paper_es_text TEXT,
  method_text TEXT,
  key_values_text TEXT,
  chart_data TEXT,
  source_files TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_development_profiles_user_film ON development_profiles(user_id, film_id);
CREATE INDEX IF NOT EXISTS idx_development_profiles_user_type ON development_profiles(user_id, profile_type);
