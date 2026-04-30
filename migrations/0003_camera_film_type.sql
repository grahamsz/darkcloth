-- Add film_type column to cameras table
-- film_type: 'sheet' for large format sheet film cameras, 'roll' for roll film cameras, null for undefined

ALTER TABLE cameras ADD COLUMN film_type TEXT CHECK (film_type IN ('sheet', 'roll', ''));

-- Add film_holders_id column to cameras for sheet film cameras
-- This links to the new film_holders table
ALTER TABLE cameras ADD COLUMN film_holders_id TEXT REFERENCES film_holders(id) ON DELETE SET NULL;

-- Add film_holder_id to photographs for sheet film shots
ALTER TABLE photographs ADD COLUMN film_holder_id TEXT REFERENCES film_holders(id) ON DELETE SET NULL;

-- Create film_holders table
CREATE TABLE IF NOT EXISTS film_holders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- e.g., '127', '220', '4x5', '8x10', etc.
  width_mm REAL,
  height_mm REAL,
  brand TEXT,
  capacity INTEGER,  -- number of sheets per pack
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_cameras_film_type ON cameras(film_type);
CREATE INDEX IF NOT EXISTS idx_cameras_film_holders ON cameras(film_holders_id);
CREATE INDEX IF NOT EXISTS idx_photographs_film_holder ON photographs(film_holder_id);
CREATE INDEX IF NOT EXISTS idx_film_holders_user ON film_holders(user_id);
