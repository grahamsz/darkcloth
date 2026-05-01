-- Add compatible_lenses column to cameras
-- Stores a JSON array of lens IDs that this camera is compatible with.
-- NULL means no restriction (all lenses are compatible).
ALTER TABLE cameras ADD COLUMN compatible_lenses TEXT;
