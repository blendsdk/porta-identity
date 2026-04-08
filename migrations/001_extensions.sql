-- Up Migration

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid() for UUID primary keys
CREATE EXTENSION IF NOT EXISTS "citext";      -- Case-insensitive text type for emails

-- Reusable trigger function to auto-update the updated_at column
-- Attach to any table: CREATE TRIGGER set_updated_at BEFORE UPDATE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration

DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE;
DROP EXTENSION IF EXISTS "citext";
DROP EXTENSION IF EXISTS "pgcrypto";
