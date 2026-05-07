-- Rebuild camera_lenses so camera compatibility rows reference the current cameras table.

ALTER TABLE camera_lenses RENAME TO camera_lenses_deprecated;

CREATE TABLE camera_lenses_new (
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (camera_id, lens_id)
);

INSERT INTO camera_lenses_new (
  camera_id,
  lens_id,
  user_id,
  created_at
)
SELECT
  camera_id,
  lens_id,
  user_id,
  created_at
FROM camera_lenses_deprecated;

DROP TABLE camera_lenses_deprecated;
ALTER TABLE camera_lenses_new RENAME TO camera_lenses;

CREATE INDEX IF NOT EXISTS idx_camera_lenses_user_camera ON camera_lenses(user_id, camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_lenses_user_lens ON camera_lenses(user_id, lens_id);
CREATE INDEX IF NOT EXISTS idx_camera_lenses_camera ON camera_lenses(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_lenses_lens ON camera_lenses(lens_id);
