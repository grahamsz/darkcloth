-- Store whether new photo logs should request the browser's current location automatically.
ALTER TABLE users
  ADD COLUMN auto_use_current_location INTEGER NOT NULL DEFAULT 0;
