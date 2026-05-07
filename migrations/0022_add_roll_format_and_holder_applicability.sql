-- Add media-format compatibility metadata for film rolls and sheet holders.
--
-- Canonical roll formats are constrained at the DB layer so API and worker logic can
-- rely on stable values for media validation.

ALTER TABLE cameras
  ADD COLUMN roll_format TEXT CHECK (
    roll_format IS NULL OR roll_format IN ('35mm', '120', '220', '127', '620')
  );

ALTER TABLE rolls
  ADD COLUMN roll_format TEXT CHECK (
    roll_format IS NULL OR roll_format IN ('35mm', '120', '220', '127', '620')
  );

CREATE INDEX IF NOT EXISTS idx_cameras_roll_format ON cameras(roll_format);
CREATE INDEX IF NOT EXISTS idx_cameras_user_roll_format ON cameras(user_id, roll_format);
CREATE INDEX IF NOT EXISTS idx_rolls_roll_format ON rolls(roll_format);
CREATE INDEX IF NOT EXISTS idx_rolls_user_roll_format ON rolls(user_id, roll_format);

-- user-scoped holder/camera compatibility:
-- rows represent explicit applicability; an empty set means "all cameras by default".

CREATE UNIQUE INDEX IF NOT EXISTS idx_cameras_user_id_id ON cameras(user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_film_holders_user_id_id ON film_holders(user_id, id);

CREATE TABLE IF NOT EXISTS film_holder_camera_applicability (
  user_id TEXT NOT NULL,
  film_holder_id TEXT NOT NULL,
  camera_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, film_holder_id, camera_id),
  FOREIGN KEY (user_id, film_holder_id) REFERENCES film_holders(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, camera_id) REFERENCES cameras(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_film_holder_camera_app_user_holder
  ON film_holder_camera_applicability(user_id, film_holder_id);

CREATE INDEX IF NOT EXISTS idx_film_holder_camera_app_user_camera
  ON film_holder_camera_applicability(user_id, camera_id);
