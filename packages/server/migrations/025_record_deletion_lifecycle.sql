-- Up Migration

ALTER TABLE organizations
  DROP CONSTRAINT organizations_status_check,
  ADD CONSTRAINT organizations_status_check
    CHECK (status IN ('active', 'suspended'));

ALTER TABLE applications
  DROP CONSTRAINT applications_status_check,
  ADD CONSTRAINT applications_status_check
    CHECK (status IN ('active', 'inactive'));

ALTER TABLE clients
  DROP CONSTRAINT clients_status_check,
  ADD CONSTRAINT clients_status_check
    CHECK (status IN ('active', 'inactive'));

ALTER TABLE permissions
  DROP CONSTRAINT permissions_module_id_fkey,
  ADD CONSTRAINT permissions_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES application_modules(id) ON DELETE CASCADE;

-- Down Migration

-- Deliberate no-op: removed lifecycle values and weaker module ownership are not restored.
SELECT 1;
