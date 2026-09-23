-- Up Migration

ALTER TABLE branding_assets
  DROP CONSTRAINT IF EXISTS branding_assets_valid_size;

ALTER TABLE branding_assets
  ADD CONSTRAINT branding_assets_valid_size
    CHECK (
      file_size > 0
      AND (
        (asset_type = 'logo' AND file_size <= 2097152)
        OR (asset_type = 'favicon' AND file_size <= 524288)
      )
    );

-- Down Migration

-- Deliberate no-op: shrinking the limit could reject logos accepted after this migration.
SELECT 1;
