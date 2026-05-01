-- Make film_holders.type nullable.
-- SQLite/D1 does not support ALTER COLUMN, so we recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE film_holders_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  width_mm REAL,
  height_mm REAL,
  brand TEXT,
  capacity INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO film_holders_new SELECT * FROM film_holders;
DROP TABLE film_holders;
ALTER TABLE film_holders_new RENAME TO film_holders;

CREATE INDEX IF NOT EXISTS idx_film_holders_user ON film_holders(user_id);

PRAGMA foreign_keys = ON;
