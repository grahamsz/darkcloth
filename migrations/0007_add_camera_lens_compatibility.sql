CREATE TABLE IF NOT EXISTS camera_lenses (
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (camera_id, lens_id)
);

CREATE INDEX IF NOT EXISTS idx_camera_lenses_user_camera ON camera_lenses(user_id, camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_lenses_user_lens ON camera_lenses(user_id, lens_id);
CREATE INDEX IF NOT EXISTS idx_camera_lenses_camera ON camera_lenses(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_lenses_lens ON camera_lenses(lens_id);
