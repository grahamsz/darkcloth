-- Add editable default N-adjustment percentages for simple development profiles.
--
-- Percent values are relative to the normal development time stored in time_text.
-- They are intentionally approximate defaults and can be tuned per profile.

ALTER TABLE development_profiles ADD COLUMN simple_n_minus_two_percent REAL NOT NULL DEFAULT 65;
ALTER TABLE development_profiles ADD COLUMN simple_n_minus_one_percent REAL NOT NULL DEFAULT 80;
ALTER TABLE development_profiles ADD COLUMN simple_n_plus_one_percent REAL NOT NULL DEFAULT 125;
ALTER TABLE development_profiles ADD COLUMN simple_n_plus_two_percent REAL NOT NULL DEFAULT 160;
