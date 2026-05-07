-- Add optional default timezone preference to users.
-- Existing rows remain NULL; no migration-time backfill is performed.

ALTER TABLE users ADD COLUMN default_timezone TEXT;
