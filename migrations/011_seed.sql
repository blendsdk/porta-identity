-- Up Migration

-- Seed data for development: super-admin organization and default system config values.
-- NOTE: Super-admin user is NOT created here (deferred to RD-06, requires password hashing).
-- NOTE: Signing keys are NOT created here (deferred to RD-03, requires crypto key generation).

-- Super-admin organization
-- The is_super_admin partial unique index ensures only one row can have is_super_admin = TRUE
INSERT INTO organizations (name, slug, status, is_super_admin, branding_company_name, default_locale)
VALUES ('Porta Admin', 'porta-admin', 'active', TRUE, 'Porta', 'en');

-- Default system configuration values
-- These control global OIDC/auth behavior and can be changed at runtime via admin UI
INSERT INTO system_config (key, value, value_type, description, is_sensitive) VALUES
    -- Token lifetimes
    ('access_token_ttl',    '"3600"',           'duration',  'Access token TTL in seconds (default: 1 hour)',              FALSE),
    ('id_token_ttl',        '"3600"',           'duration',  'ID token TTL in seconds (default: 1 hour)',                  FALSE),
    ('refresh_token_ttl',   '"2592000"',        'duration',  'Refresh token TTL in seconds (default: 30 days)',            FALSE),
    ('authorization_code_ttl', '"600"',         'duration',  'Authorization code TTL in seconds (default: 10 minutes)',    FALSE),

    -- Session settings
    ('session_ttl',         '"86400"',          'duration',  'Session TTL in seconds (default: 24 hours)',                 FALSE),
    ('cookie_secure',       'true',             'boolean',   'Require HTTPS for cookies (disable for local dev only)',     FALSE),

    -- Magic link / passwordless
    ('magic_link_ttl',      '"900"',            'duration',  'Magic link token TTL in seconds (default: 15 minutes)',      FALSE),
    ('magic_link_length',   '48',               'number',    'Magic link token length in bytes',                           FALSE),

    -- Password reset
    ('password_reset_ttl',  '"3600"',           'duration',  'Password reset token TTL in seconds (default: 1 hour)',      FALSE),

    -- Invitation
    ('invitation_ttl',      '"604800"',         'duration',  'Invitation token TTL in seconds (default: 7 days)',          FALSE),

    -- Rate limiting
    ('login_rate_limit',    '10',               'number',    'Max login attempts per user per 15 minutes',                 FALSE),
    ('api_rate_limit',      '100',              'number',    'Max API requests per client per minute',                     FALSE),

    -- Account lockout
    ('max_failed_logins',   '5',                'number',    'Max failed logins before account lockout',                   FALSE),
    ('lockout_duration',    '"900"',            'duration',  'Account lockout duration in seconds (default: 15 minutes)',   FALSE),

    -- PKCE
    ('require_pkce',        'true',             'boolean',   'Require PKCE for all authorization code flows',              FALSE),

    -- CORS
    ('cors_max_age',        '86400',            'number',    'CORS preflight cache duration in seconds (default: 24h)',    FALSE);

-- Down Migration

-- Remove seed data in reverse order
DELETE FROM system_config;
DELETE FROM organizations WHERE slug = 'porta-admin';
