-- Add optional BTZS profile curve interpolation and experimental range expansion.
--
-- btzs_curve_interpolation_enabled keeps the historical straight segment lookup
-- off by default. btzs_extrapolation_stops constrains experimental extrapolation
-- beyond the measured chart range.

ALTER TABLE development_profiles ADD COLUMN btzs_curve_interpolation_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE development_profiles ADD COLUMN btzs_extrapolation_stops REAL NOT NULL DEFAULT 0;
