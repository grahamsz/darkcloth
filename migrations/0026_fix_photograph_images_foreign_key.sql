-- Rebuild photograph_images so its foreign key points at the active photographs table.
--
-- Migration 0014 renamed photographs during a table rebuild, but photograph_images
-- kept a foreign key reference to photographs_deprecated. That breaks every image
-- metadata insert because the parent row only exists in photographs.

PRAGMA foreign_keys = OFF;

ALTER TABLE photograph_images RENAME TO photograph_images_deprecated;

CREATE TABLE photograph_images (
  id TEXT PRIMARY KEY,
  photograph_id TEXT NOT NULL REFERENCES photographs(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  original_filename TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  thumbnail_r2_key TEXT,
  thumbnail_content_type TEXT,
  thumbnail_width INTEGER,
  thumbnail_height INTEGER,
  original_r2_key TEXT,
  original_content_type TEXT,
  original_width INTEGER,
  original_height INTEGER
);

INSERT INTO photograph_images (
  id,
  photograph_id,
  r2_key,
  content_type,
  width,
  height,
  original_filename,
  created_at,
  thumbnail_r2_key,
  thumbnail_content_type,
  thumbnail_width,
  thumbnail_height,
  original_r2_key,
  original_content_type,
  original_width,
  original_height
)
SELECT
  id,
  photograph_id,
  r2_key,
  content_type,
  width,
  height,
  original_filename,
  created_at,
  thumbnail_r2_key,
  thumbnail_content_type,
  thumbnail_width,
  thumbnail_height,
  original_r2_key,
  original_content_type,
  original_width,
  original_height
FROM photograph_images_deprecated;

DROP TABLE photograph_images_deprecated;

CREATE INDEX IF NOT EXISTS idx_photograph_images_photo ON photograph_images(photograph_id);

PRAGMA foreign_keys = ON;
