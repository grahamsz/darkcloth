-- Normalize legacy lens aperture defaults created before canonical 5.6..32 values.
-- Existing null/missing values and legacy 1..22 defaults are updated.

UPDATE lenses
SET
  min_f_stop = CASE
    WHEN min_f_stop IS NULL THEN 5.6
    WHEN min_f_stop = 1 AND max_f_stop = 22 AND (aperture_increment IS NULL OR aperture_increment = 'full') THEN 5.6
    ELSE min_f_stop
  END,
  max_f_stop = CASE
    WHEN max_f_stop IS NULL THEN 32
    WHEN min_f_stop = 1 AND max_f_stop = 22 AND (aperture_increment IS NULL OR aperture_increment = 'full') THEN 32
    ELSE max_f_stop
  END,
  aperture_increment = CASE
    WHEN aperture_increment IN ('full', 'half', 'third') THEN aperture_increment
    ELSE 'full'
  END
WHERE
  min_f_stop IS NULL
  OR max_f_stop IS NULL
  OR aperture_increment IS NULL
  OR aperture_increment NOT IN ('full', 'half', 'third')
  OR (min_f_stop = 1 AND max_f_stop = 22 AND (aperture_increment IS NULL OR aperture_increment = 'full'));
