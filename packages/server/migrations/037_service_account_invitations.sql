-- Up Migration

-- Classification belongs to the account, not to a removable OAuth binding. A revoked or
-- orphaned machine account must never become eligible for human authentication again.
ALTER TABLE users
    ADD COLUMN is_service_account BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.is_service_account IS
    'Permanent internal classification for noninteractive machine accounts; never a public user input';

CREATE TABLE client_service_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
    account_id              UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    authorization_version   UUID NOT NULL DEFAULT gen_random_uuid(),
    status                  VARCHAR(20) NOT NULL CHECK (status IN ('active', 'revoked')),
    targets                 JSONB NOT NULL CHECK (jsonb_typeof(targets) = 'array'),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- An erased owner leaves a non-restorable marker, not an invitation to provision another
    -- account for the same client. Account deletion must revoke and clear policy first.
    CONSTRAINT service_account_ownerless_marker CHECK (
        account_id IS NOT NULL OR (status = 'revoked' AND targets = '[]'::jsonb)
    )
);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON client_service_accounts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE client_service_accounts IS
    'Client-owned invitation authority; a revoked row without an account permanently prevents reassignment';
COMMENT ON COLUMN client_service_accounts.authorization_version IS
    'Unpredictable authority generation checked against native opaque machine tokens';
COMMENT ON COLUMN client_service_accounts.targets IS
    'Explicit organization and application-qualified role/claim-definition allowlists, validated on write and read';

-- Existing installations already have the canonical application. Fresh installations create it
-- during initialization, which separately creates the same reserved role. A conflicting role
-- name aborts this transaction instead of silently adopting an existing role or its members.
INSERT INTO roles (application_id, name, slug, description)
SELECT id, 'Invitation Service', 'porta-invite-service',
       'Reserved noninteractive invitation-only service-account role'
FROM applications WHERE slug = 'porta-admin';

INSERT INTO permissions (application_id, name, slug, description)
SELECT id, 'Invite Users', 'admin:user:invite', 'Invite users to an explicitly authorized organization'
FROM applications WHERE slug = 'porta-admin'
ON CONFLICT (application_id, slug) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN applications a ON a.id = r.application_id AND a.slug = 'porta-admin'
JOIN permissions p ON p.application_id = a.id AND p.slug = 'admin:user:invite'
WHERE r.slug = 'porta-invite-service';

-- Down Migration

-- Dropping either classification or ownership history would make an older binary treat a
-- surviving machine identity as human, or allow a client to acquire a different owner.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE is_service_account)
       OR EXISTS (SELECT 1 FROM client_service_accounts) THEN
        RAISE EXCEPTION 'Remove all service-account identities and bindings before downgrade';
    END IF;
END;
$$;

DELETE FROM roles r USING applications a
WHERE r.application_id = a.id AND a.slug = 'porta-admin' AND r.slug = 'porta-invite-service';

-- The invitation permission predates this feature and remains shared by human administration.
DROP TABLE client_service_accounts;
ALTER TABLE users DROP COLUMN is_service_account;
