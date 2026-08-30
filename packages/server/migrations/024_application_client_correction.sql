-- Up Migration

-- Refuse the upgrade before changing any row when legacy data exceeds the supported credential
-- overlap bound. Operators can revoke excess credentials with the previous server and retry.
-- Hold this lock for the migration transaction so a concurrent secret write cannot pass the
-- precondition and create unsupported over-limit data before the migration commits.
LOCK TABLE client_secrets IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT client_id
      FROM client_secrets
     WHERE status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     GROUP BY client_id
    HAVING COUNT(*) > 10
  ) THEN
    RAISE EXCEPTION 'Client has more than 10 active secrets; revoke excess secrets before upgrading';
  END IF;
END $$;

-- Existing Application Admin roles need organization read access because client administration
-- resolves the selected organization. The stable slugs and conflict guard make reruns harmless.
INSERT INTO role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM roles AS role_row
  JOIN permissions AS permission_row
    ON permission_row.application_id = role_row.application_id
 WHERE role_row.slug = 'porta-app-admin'
   AND permission_row.slug = 'admin:org:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Down Migration

-- Forward-only data correction. The up migration cannot distinguish a permission mapping that it
-- inserted from one that already existed, so rollback deliberately preserves both cases rather
-- than deleting operator-owned access.
SELECT 1;
