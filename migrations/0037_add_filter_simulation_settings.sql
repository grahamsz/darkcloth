-- Store per-filter browser-side black-and-white simulation settings.
--
-- These values are intentionally visual preview controls, not exposure math.
-- Filter factor remains the exposure compensation source of truth.

ALTER TABLE filters ADD COLUMN can_simulate_bw INTEGER NOT NULL DEFAULT 0;
ALTER TABLE filters ADD COLUMN simulation_rgb TEXT NOT NULL DEFAULT '#f05a28';
ALTER TABLE filters ADD COLUMN simulation_strength REAL NOT NULL DEFAULT 0.42;
ALTER TABLE filters ADD COLUMN simulation_brightness_boost REAL NOT NULL DEFAULT 1;
