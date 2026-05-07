ALTER TABLE films ADD COLUMN spectral_response_preset TEXT;
ALTER TABLE films ADD COLUMN simulate_spectral_response INTEGER NOT NULL DEFAULT 0;
