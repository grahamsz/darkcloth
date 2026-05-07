-- Add stock-type categorization for film records.
--
-- stock_type uses a closed set so values stay consistent and UI/API validation can rely
-- on these categories.
-- Accepted values:
--  - bw
--  - color_negative
--  - color_slide
--  - other
--
-- Backfill strategy (strong signals only):
-- 1) films with any BTZS development profile are classified as `bw`.
-- 2) films whose process text strongly indicates black-and-white (`b&w`, `b/w`,
--    `black and white`, `black-and-white`) are classified as `bw`.
-- 3) films with process text containing `C-41` are classified as `color_negative`.
-- 4) films with process text containing `E-6` are classified as `color_slide`.
-- 5) everything else remains `other` for explicit manual correction.
-- Ambiguous/inferentially weak process values are intentionally left as `other` to avoid
-- silent misclassification.

ALTER TABLE films
  ADD COLUMN stock_type TEXT NOT NULL DEFAULT 'other'
  CHECK (stock_type IN ('bw', 'color_negative', 'color_slide', 'other'));

UPDATE films
SET stock_type = 'bw'
WHERE EXISTS (
    SELECT 1
    FROM development_profiles dp
    WHERE dp.film_id = films.id
      AND dp.profile_type = 'btzs'
)
OR LOWER(COALESCE(process, '')) LIKE '%b&w%'
OR LOWER(COALESCE(process, '')) LIKE '%b/w%'
OR LOWER(COALESCE(process, '')) LIKE '%black and white%'
OR LOWER(COALESCE(process, '')) LIKE '%black-and-white%';

UPDATE films
SET stock_type = 'color_negative'
WHERE stock_type = 'other'
  AND LOWER(COALESCE(process, '')) LIKE '%c-41%';

UPDATE films
SET stock_type = 'color_slide'
WHERE stock_type = 'other'
  AND LOWER(COALESCE(process, '')) LIKE '%e-6%';

CREATE INDEX IF NOT EXISTS idx_films_stock_type ON films(stock_type);
