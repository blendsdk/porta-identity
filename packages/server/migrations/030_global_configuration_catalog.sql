-- Up Migration

-- Operational policy uses native JSONB scalars. Canonical earlier values are intentionally reset;
-- bootstrap/internal rows are not part of the administrative catalog and remain untouched.
INSERT INTO system_config (key, value, value_type, description, is_sensitive) VALUES
    ('access_token_ttl', '3600'::jsonb, 'duration', 'How long newly issued access tokens remain valid.', FALSE),
    ('id_token_ttl', '3600'::jsonb, 'duration', 'How long newly issued ID tokens remain valid.', FALSE),
    ('refresh_token_ttl', '2592000'::jsonb, 'duration', 'How long newly issued refresh tokens remain valid.', FALSE),
    ('authorization_code_ttl', '600'::jsonb, 'duration', 'How long a newly issued authorization code remains valid.', FALSE),
    ('session_ttl', '86400'::jsonb, 'duration', 'How long newly created OIDC sessions remain valid.', FALSE),
    ('magic_link_ttl', '900'::jsonb, 'duration', 'How long a newly created magic-link token remains valid.', FALSE),
    ('password_reset_ttl', '3600'::jsonb, 'duration', 'How long a newly created password-reset token remains valid.', FALSE),
    ('invitation_ttl', '604800'::jsonb, 'duration', 'How long a newly created user invitation remains valid.', FALSE),
    ('rate_limit_login_max', '10'::jsonb, 'number', 'Maximum login attempts allowed in one login window.', FALSE),
    ('rate_limit_login_window', '900'::jsonb, 'duration', 'Window used to count login attempts.', FALSE),
    ('rate_limit_magic_link_max', '5'::jsonb, 'number', 'Maximum magic-link requests allowed in one window.', FALSE),
    ('rate_limit_magic_link_window', '900'::jsonb, 'duration', 'Window used to count magic-link requests.', FALSE),
    ('rate_limit_password_reset_max', '5'::jsonb, 'number', 'Maximum password-reset requests allowed in one window.', FALSE),
    ('rate_limit_password_reset_window', '900'::jsonb, 'duration', 'Window used to count password-reset requests.', FALSE),
    ('max_failed_logins', '5'::jsonb, 'number', 'Failed login count that activates automatic lockout.', FALSE),
    ('lockout_duration_seconds', '900'::jsonb, 'duration', 'Duration applied when automatic lockout eligibility is checked.', FALSE),
    ('audit_retention_days', '90'::jsonb, 'number', 'Default number of days retained by audit cleanup.', FALSE),
    ('default_locale', '"en"'::jsonb, 'string', 'Final locale fallback used by the authentication UI.', FALSE)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    value_type = EXCLUDED.value_type,
    description = EXCLUDED.description,
    is_sensitive = EXCLUDED.is_sensitive,
    updated_at = NOW();

DELETE FROM system_config WHERE key IN (
    'login_rate_limit', 'lockout_duration', 'api_rate_limit', 'cookie_secure',
    'magic_link_length', 'require_pkce', 'cors_max_age'
);

-- Down Migration

-- No-op: earlier policy values cannot be reconstructed after the intentional reset.
-- Development recovery uses yarn admin:env reset rather than reversing these defaults.
