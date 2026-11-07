-- Up Migration

-- A resource server is owned by one application. Clients inherit the ability to request only the
-- resource servers of the application that owns them; no per-client allowlist is introduced here.
CREATE TABLE resource_servers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    slug            VARCHAR(100) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    identifier      TEXT NOT NULL,
    audience        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (application_id, slug),
    UNIQUE (identifier),
    UNIQUE (audience),
    -- RFC 8707 resource indicators are absolute URIs. The service validates the full URL; these
    -- checks keep direct SQL from creating a relative, oversized or fragmented authority value.
    CONSTRAINT resource_server_identifier_absolute CHECK (
        identifier ~ '^[a-z][a-z0-9+.-]*:' AND position('#' in identifier) = 0
    ),
    CONSTRAINT resource_server_audience_absolute CHECK (
        audience ~ '^[a-z][a-z0-9+.-]*:' AND position('#' in audience) = 0
    ),
    CONSTRAINT resource_server_identifier_length CHECK (length(identifier) BETWEEN 1 AND 2048),
    CONSTRAINT resource_server_audience_length CHECK (length(audience) BETWEEN 1 AND 2048)
);

COMMENT ON TABLE resource_servers IS
    'Application-owned API resource identifiers and the audience returned in an access token';
COMMENT ON COLUMN resource_servers.identifier IS
    'Exact RFC 8707 resource indicator requested by the client';
COMMENT ON COLUMN resource_servers.audience IS
    'Explicit access-token audience; operators may set it equal to the identifier';

CREATE INDEX resource_servers_application_id_idx ON resource_servers (application_id);

-- One database-enforced namespace prevents an application from naming another application's
-- resource as its token audience. A row contributes both its identifier and audience exactly once;
-- concurrent writers serialize on the primary key rather than relying on a read-then-write check.
CREATE TABLE resource_server_namespace (
    value              TEXT PRIMARY KEY,
    resource_server_id UUID NOT NULL REFERENCES resource_servers(id) ON DELETE CASCADE
);

CREATE FUNCTION default_resource_server_audience() RETURNS trigger AS $$
BEGIN
    IF NEW.audience IS NULL THEN
        NEW.audience := NEW.identifier;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER default_resource_server_audience
    BEFORE INSERT OR UPDATE ON resource_servers
    FOR EACH ROW EXECUTE FUNCTION default_resource_server_audience();

CREATE FUNCTION maintain_resource_server_namespace() RETURNS trigger AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        DELETE FROM resource_server_namespace WHERE resource_server_id = OLD.id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        INSERT INTO resource_server_namespace (value, resource_server_id)
            VALUES (NEW.identifier, NEW.id);
        IF NEW.audience <> NEW.identifier THEN
            INSERT INTO resource_server_namespace (value, resource_server_id)
                VALUES (NEW.audience, NEW.id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintain_resource_server_namespace
    AFTER INSERT OR UPDATE OR DELETE ON resource_servers
    FOR EACH ROW EXECUTE FUNCTION maintain_resource_server_namespace();

CREATE TABLE resource_server_scopes (
    resource_server_id UUID NOT NULL REFERENCES resource_servers(id) ON DELETE CASCADE,
    scope              VARCHAR(255) NOT NULL,
    PRIMARY KEY (resource_server_id, scope),
    CONSTRAINT resource_server_scope_shape CHECK (scope ~ '^[A-Za-z0-9_.:-]+$')
);

COMMENT ON TABLE resource_server_scopes IS
    'Explicit custom scopes a resource server accepts in its allowed set; standard OIDC scopes remain protocol-owned';

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON resource_servers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Down Migration

DROP TABLE resource_server_scopes;
DROP TABLE resource_server_namespace;
DROP TABLE resource_servers;
DROP FUNCTION IF EXISTS maintain_resource_server_namespace();
DROP FUNCTION IF EXISTS default_resource_server_audience();
