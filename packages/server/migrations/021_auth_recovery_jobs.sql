-- Up Migration

-- Durable recovery work keeps public authentication requests independent from account existence.
-- Protected addresses are encrypted before insertion; this table never stores plaintext addresses
-- or authentication artifacts.
CREATE TABLE auth_recovery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(32) NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    address_ciphertext TEXT NOT NULL,
    address_iv TEXT NOT NULL,
    address_tag TEXT NOT NULL,
    address_key_id VARCHAR(64) NOT NULL,
    interaction_uid VARCHAR(128),
    idempotency_digest CHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'available',
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    claimed_by UUID,
    attempt_count SMALLINT NOT NULL DEFAULT 0,
    last_failure_reason VARCHAR(64),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT auth_recovery_jobs_type
        CHECK (job_type IN ('magic_link', 'password_reset')),
    CONSTRAINT auth_recovery_jobs_status
        CHECK (status IN ('available', 'claimed', 'completed', 'terminal_failure')),
    CONSTRAINT auth_recovery_jobs_attempt_count
        CHECK (attempt_count BETWEEN 0 AND 5),
    CONSTRAINT auth_recovery_jobs_idempotency_digest
        CHECK (idempotency_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT auth_recovery_jobs_protected_address
        CHECK (
            address_ciphertext ~ '^[A-Za-z0-9_-]+$'
            AND address_iv ~ '^[A-Za-z0-9_-]+$'
            AND address_tag ~ '^[A-Za-z0-9_-]+$'
            AND address_key_id ~ '^[A-Za-z0-9_-]{8,64}$'
        ),
    CONSTRAINT auth_recovery_jobs_interaction_uid
        CHECK (
            (job_type = 'magic_link' AND char_length(interaction_uid) BETWEEN 1 AND 128)
            OR (job_type = 'password_reset' AND interaction_uid IS NULL)
        ),
    CONSTRAINT auth_recovery_jobs_failure_reason
        CHECK (
            last_failure_reason IS NULL
            OR last_failure_reason ~ '^[a-z][a-z0-9_]{0,63}$'
        ),
    CONSTRAINT auth_recovery_jobs_claim_state
        CHECK (
            (status = 'claimed' AND claimed_at IS NOT NULL AND claimed_by IS NOT NULL)
            OR (status <> 'claimed' AND claimed_at IS NULL AND claimed_by IS NULL)
        ),
    CONSTRAINT auth_recovery_jobs_completion_state
        CHECK (
            (status IN ('completed', 'terminal_failure') AND completed_at IS NOT NULL)
            OR (status NOT IN ('completed', 'terminal_failure') AND completed_at IS NULL)
        ),
    CONSTRAINT auth_recovery_jobs_idempotency
        UNIQUE (organization_id, job_type, idempotency_digest)
);

CREATE INDEX auth_recovery_jobs_available
    ON auth_recovery_jobs (available_at, created_at, id)
    WHERE status = 'available' AND attempt_count < 5;

CREATE INDEX auth_recovery_jobs_expired_claims
    ON auth_recovery_jobs (claimed_at, created_at, id)
    WHERE status = 'claimed' AND attempt_count < 5;

-- Down Migration

DROP TABLE IF EXISTS auth_recovery_jobs;
