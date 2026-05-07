-- Add structured exposure metadata for bulb photography.
--
-- Keep legacy compatibility fields (`shutter_speed`, `shutter_speed_seconds`) and add
-- a stable structured mode field plus explicit measured bulb duration:
-- - `shutter_mode`: 'fixed' or 'bulb'
-- - `bulb_duration_seconds`: duration in seconds when `shutter_mode = 'bulb'`
--
-- Downstream API invariants (for write/validation layers):
-- - fixed-mode writes should keep `bulb_duration_seconds` null and use
--   `shutter_speed_seconds` for calculation.
-- - bulb-mode writes should provide `bulb_duration_seconds` > 0 for new/updated rows.
-- - legacy values remain writable and readable via `shutter_speed` fields.

ALTER TABLE photographs
  ADD COLUMN shutter_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (shutter_mode IN ('fixed', 'bulb'));

ALTER TABLE photographs
  ADD COLUMN bulb_duration_seconds REAL;

-- Backfill historical bulb entries where shutter text is exactly "bulb"/"BULB".
UPDATE photographs
SET shutter_mode = 'bulb'
WHERE shutter_speed IS NOT NULL
  AND lower(trim(replace(replace(shutter_speed, '"', ''), '''', ''))) = 'bulb';
