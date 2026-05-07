-- Add raw XDF metadata persistence for BTZS development profiles.
--
-- This stores the top-level rawXdf payload as plain text/JSON text.

ALTER TABLE development_profiles
  ADD COLUMN raw_xdf TEXT;
