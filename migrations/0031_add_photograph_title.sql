-- Add an optional title field to photographs.
-- Existing rows remain unchanged and therefore receive NULL titles by default.

ALTER TABLE photographs
  ADD COLUMN title TEXT;
