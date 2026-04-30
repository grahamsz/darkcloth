CREATE INDEX IF NOT EXISTS idx_cameras_user ON cameras(user_id);
CREATE INDEX IF NOT EXISTS idx_lenses_user ON lenses(user_id);
CREATE INDEX IF NOT EXISTS idx_films_user ON films(user_id);
CREATE INDEX IF NOT EXISTS idx_rolls_user ON rolls(user_id);
CREATE INDEX IF NOT EXISTS idx_photographs_user ON photographs(user_id);
CREATE INDEX IF NOT EXISTS idx_photograph_images_photo ON photograph_images(photograph_id);
