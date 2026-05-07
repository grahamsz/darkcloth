-- Add focal range support while preserving existing focal_length compatibility.
-- Prime lenses are represented as equal min and max.
ALTER TABLE lenses ADD COLUMN min_focal_length_mm REAL;
ALTER TABLE lenses ADD COLUMN max_focal_length_mm REAL;

-- Backfill existing rows from legacy focal_length_mm when present.
UPDATE lenses
SET
  min_focal_length_mm = focal_length_mm,
  max_focal_length_mm = focal_length_mm
WHERE
  focal_length_mm IS NOT NULL;
