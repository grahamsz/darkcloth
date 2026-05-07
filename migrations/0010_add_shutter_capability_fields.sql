-- Add shutter capability columns to gear tables.
-- Existing rows keep null shutter ranges and default to supports_bulb = 0.

ALTER TABLE cameras ADD COLUMN min_shutter_speed_seconds REAL;
ALTER TABLE cameras ADD COLUMN max_shutter_speed_seconds REAL;
ALTER TABLE cameras ADD COLUMN supports_bulb INTEGER NOT NULL DEFAULT 0;

ALTER TABLE lenses ADD COLUMN min_shutter_speed_seconds REAL;
ALTER TABLE lenses ADD COLUMN max_shutter_speed_seconds REAL;
ALTER TABLE lenses ADD COLUMN supports_bulb INTEGER NOT NULL DEFAULT 0;
