-- Add explicit image variant metadata to photograph_images.
-- Existing r2_key/content_type/width/height remain the canonical display image for backwards compatibility.
-- Optional columns let callers persist a separate 256px thumbnail and optional original file metadata when needed.

ALTER TABLE photograph_images ADD COLUMN thumbnail_r2_key TEXT;
ALTER TABLE photograph_images ADD COLUMN thumbnail_content_type TEXT;
ALTER TABLE photograph_images ADD COLUMN thumbnail_width INTEGER;
ALTER TABLE photograph_images ADD COLUMN thumbnail_height INTEGER;

ALTER TABLE photograph_images ADD COLUMN original_r2_key TEXT;
ALTER TABLE photograph_images ADD COLUMN original_content_type TEXT;
ALTER TABLE photograph_images ADD COLUMN original_width INTEGER;
ALTER TABLE photograph_images ADD COLUMN original_height INTEGER;
