-- Up Migration

-- Configurable Login Methods (plans/client-login-methods)
-- Adds organization-level default login methods + per-client override.
-- Two-level inheritance model:
--   1. organizations.default_login_methods — org-wide default (NOT NULL, defaults to {password, magic_link})
--   2. clients.login_methods — per-client override (NULL = inherit from org)
--
-- Future-proof design: TEXT[] without a value CHECK so adding 'sso' or 'passkey' later
-- is a pure TypeScript change with no migration required. All writes are funneled through
-- the service layer, which validates against the LoginMethod TypeScript union.

-- Organizations: default authentication methods for all clients in the org.
ALTER TABLE organizations
    ADD COLUMN default_login_methods TEXT[] NOT NULL
        DEFAULT ARRAY['password', 'magic_link']::TEXT[];

COMMENT ON COLUMN organizations.default_login_methods IS
    'Default authentication methods available for all clients in this org. Clients may override via clients.login_methods. Values: password, magic_link (extensible — sso/passkey in future).';

-- Clients: per-client override of org default. NULL = inherit from org.
-- Empty array ({}) is invalid and rejected by the service layer (NULL is the canonical
-- "inherit" sentinel). Non-null values must be a non-empty subset of LoginMethod.
ALTER TABLE clients
    ADD COLUMN login_methods TEXT[] DEFAULT NULL;

COMMENT ON COLUMN clients.login_methods IS
    'Authentication methods for this client. NULL = inherit from organizations.default_login_methods. Non-null must be non-empty.';

-- Down Migration

-- Drop in reverse order of creation (clients first since it's the leaf).
ALTER TABLE clients DROP COLUMN IF EXISTS login_methods;
ALTER TABLE organizations DROP COLUMN IF EXISTS default_login_methods;
