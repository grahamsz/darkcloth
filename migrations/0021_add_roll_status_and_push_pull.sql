-- Add push/pull stop tracking and canonical roll lifecycle status.
-- Push/pull is constrained to legal values so invalid offsets are blocked at DB layer.
ALTER TABLE rolls
  ADD COLUMN push_pull_stops INTEGER NOT NULL DEFAULT 0 CHECK (push_pull_stops BETWEEN -3 AND 3);

-- Canonical roll exposure lifecycle status values.
ALTER TABLE rolls
  ADD COLUMN status TEXT NOT NULL DEFAULT 'unexposed'
  CHECK (status IN ('unexposed', 'exposing', 'developed'));

-- Backfill status for existing production rows.
UPDATE rolls
SET status = 'developed'
WHERE developed_at IS NOT NULL;

UPDATE rolls
SET status = 'exposing'
WHERE developed_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM photographs
    WHERE roll_id = rolls.id
  );

-- Add indexes required for efficient roll and status queries.
CREATE INDEX IF NOT EXISTS idx_photographs_roll ON photographs(roll_id);
CREATE INDEX IF NOT EXISTS idx_rolls_user_status ON rolls(user_id, status);
