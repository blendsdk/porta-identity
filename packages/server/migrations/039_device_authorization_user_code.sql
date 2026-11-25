-- Up Migration

-- Device authorization user codes must be unique: the verification page resolves a code to exactly
-- one client and tenant. The generic user_code index from migration 010 remains non-unique because
-- other OIDC artifact types do not require uniqueness.
--
-- Fail before creating the index when retained DeviceCode rows already share a code. Operators must
-- remove or migrate those transient rows; silently keeping one of them would make verification
-- depend on physical row order.
DO $$
DECLARE
    duplicate_groups INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_groups
      FROM (
        SELECT user_code
          FROM oidc_payloads
         WHERE type = 'DeviceCode' AND user_code IS NOT NULL
         GROUP BY user_code
        HAVING COUNT(*) > 1
      ) AS duplicates;

    IF duplicate_groups > 0 THEN
        RAISE EXCEPTION
            'Cannot create the DeviceCode user-code unique index: % normalized code(s) are shared by more than one retained DeviceCode row. Delete or migrate the duplicate rows (SELECT user_code, COUNT(*) FROM oidc_payloads WHERE type = ''DeviceCode'' GROUP BY user_code HAVING COUNT(*) > 1) and rerun the migration.',
            duplicate_groups;
    END IF;
END
$$;

-- The migration runner executes SQL migrations inside a transaction, so a concurrent index build is
-- not available here. The table is small at this point because DeviceCode rows are short-lived and
-- were previously only created by disabled-by-default functionality.
CREATE UNIQUE INDEX idx_oidc_payloads_device_user_code
    ON oidc_payloads (user_code)
    WHERE type = 'DeviceCode' AND user_code IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS idx_oidc_payloads_device_user_code;
