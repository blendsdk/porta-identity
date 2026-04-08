-- Up Migration

-- Audit log for security events
-- Uses SET NULL on delete to preserve audit entries when users/orgs are removed
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_id        UUID REFERENCES users(id) ON DELETE SET NULL, -- Who performed the action
    event_type      VARCHAR(100) NOT NULL,                -- e.g., "user.login.success"
    event_category  VARCHAR(50) NOT NULL,                 -- e.g., "authentication", "admin", "security"
    description     TEXT,
    metadata        JSONB DEFAULT '{}',                   -- Additional context (IP, user-agent, etc.)
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite indexes for common query patterns (org+time, user+time, event+time)
CREATE INDEX idx_audit_log_org ON audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_event ON audit_log(event_type, created_at DESC);
CREATE INDEX idx_audit_log_category ON audit_log(event_category, created_at DESC);

COMMENT ON TABLE audit_log IS 'Security event audit log — append-only, preserved on user/org deletion';
COMMENT ON COLUMN audit_log.actor_id IS 'The user who performed the action (may differ from user_id for admin actions)';
COMMENT ON COLUMN audit_log.metadata IS 'Structured additional context (e.g., IP address, user-agent, request details)';

-- Down Migration

DROP TABLE IF EXISTS audit_log CASCADE;
