-- Add reciprocity P factor for film stocks.
--
-- Default and constraint values are chosen for compatibility and future reciprocity
-- calculations, while keeping existing behavior stable.

ALTER TABLE films
  ADD COLUMN reciprocity_p_factor REAL NOT NULL DEFAULT 1 CHECK (reciprocity_p_factor > 0);

UPDATE films
SET reciprocity_p_factor = 1
WHERE reciprocity_p_factor IS NULL;
