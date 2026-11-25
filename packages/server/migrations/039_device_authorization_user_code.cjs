/**
 * Device authorization user-code uniqueness.
 *
 * `oidc_payloads` stores every OIDC artifact, not only short-lived DeviceCode
 * rows. A regular `CREATE INDEX` takes a lock that blocks token, session and
 * grant writes for the whole build, so this migration opts out of the runner's
 * transaction and builds the unique index concurrently.
 *
 * The preflight fails before the build when retained DeviceCode rows already
 * share a normalized code. Operators must remove or migrate those transient
 * rows; silently keeping one would make verification depend on row order.
 */

exports.up = (pgm) => {
  pgm.noTransaction();

  pgm.sql(`
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
  `);

  pgm.createIndex('oidc_payloads', ['user_code'], {
    name: 'idx_oidc_payloads_device_user_code',
    unique: true,
    concurrently: true,
    where: "type = 'DeviceCode' AND user_code IS NOT NULL",
  });
};

exports.down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX IF EXISTS idx_oidc_payloads_device_user_code;');
};
