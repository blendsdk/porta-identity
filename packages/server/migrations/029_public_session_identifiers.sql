-- Up Migration

-- Administrative session APIs must not expose the Redis session key because
-- possession of that key grants access to the live session.

ALTER TABLE admin_sessions
    ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE admin_sessions
    ADD CONSTRAINT admin_sessions_public_id_unique UNIQUE (public_id);

-- Down Migration

ALTER TABLE admin_sessions
    DROP CONSTRAINT IF EXISTS admin_sessions_public_id_unique,
    DROP COLUMN IF EXISTS public_id;
