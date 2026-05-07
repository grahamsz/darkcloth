-- Add exposure-entry mode tracking and structured exposure detail persistence for photographs.
--
-- Existing rows are treated as manual entry mode by default and retain their legacy
-- final exposure fields (aperture/shutter/etc.) for backward compatibility.
-- New workflows can additionally persist `exposure_details_json` for details of
-- zone/BTZS zone calculations used to generate the final exposure values.

ALTER TABLE photographs
  ADD COLUMN exposure_entry_mode TEXT
  NOT NULL DEFAULT 'manual'
  CHECK (exposure_entry_mode IN ('manual', 'zone-metering', 'btzs-zone-metering'));

ALTER TABLE photographs
  ADD COLUMN exposure_details_json TEXT
  CHECK (exposure_details_json IS NULL OR json_valid(exposure_details_json));

UPDATE photographs
SET exposure_entry_mode = 'manual'
WHERE exposure_entry_mode IS NULL;

CREATE INDEX IF NOT EXISTS idx_photographs_user_exposure_entry_mode
  ON photographs(user_id, exposure_entry_mode);
