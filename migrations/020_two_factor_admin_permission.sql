-- Up Migration

-- Migration 020: Add admin:user:2fa permission for 2FA admin API management
--
-- This migration adds the admin:user:2fa permission to the porta-admin
-- application and assigns it to the porta-super-admin, porta-user-admin,
-- and porta-admin (legacy) roles.
--
-- The permission governs state-changing 2FA admin operations:
--   - POST .../two-factor/disable
--   - POST .../two-factor/reset
--   - POST .../two-factor/recovery-codes/regenerate
--
-- Read-only status inspection uses the existing admin:user:read permission.
--
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING throughout.

DO $$
DECLARE
  v_app_id UUID;
  v_perm_id UUID;
  v_super_admin_role_id UUID;
  v_user_admin_role_id UUID;
  v_legacy_admin_role_id UUID;
BEGIN
  -- Find the porta-admin application
  SELECT id INTO v_app_id
  FROM applications
  WHERE slug = 'porta-admin'
  LIMIT 1;

  -- If porta-admin app doesn't exist, skip (pre-init state)
  IF v_app_id IS NULL THEN
    RAISE NOTICE 'porta-admin application not found — skipping 2FA permission seed';
    RETURN;
  END IF;

  -- Insert the permission
  INSERT INTO permissions (application_id, slug, name, description, status)
  VALUES (
    v_app_id,
    'admin:user:2fa',
    'Manage User 2FA',
    'Disable, reset, or regenerate recovery codes for user two-factor authentication',
    'active'
  )
  ON CONFLICT (application_id, slug) DO NOTHING
  RETURNING id INTO v_perm_id;

  -- If permission already existed, look it up
  IF v_perm_id IS NULL THEN
    SELECT id INTO v_perm_id
    FROM permissions
    WHERE application_id = v_app_id AND slug = 'admin:user:2fa';
  END IF;

  -- Find role IDs
  SELECT id INTO v_super_admin_role_id
  FROM roles
  WHERE application_id = v_app_id AND slug = 'porta-super-admin';

  SELECT id INTO v_user_admin_role_id
  FROM roles
  WHERE application_id = v_app_id AND slug = 'porta-user-admin';

  SELECT id INTO v_legacy_admin_role_id
  FROM roles
  WHERE application_id = v_app_id AND slug = 'porta-admin';

  -- Assign permission to roles
  IF v_super_admin_role_id IS NOT NULL AND v_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (v_super_admin_role_id, v_perm_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_user_admin_role_id IS NOT NULL AND v_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (v_user_admin_role_id, v_perm_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_legacy_admin_role_id IS NOT NULL AND v_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (v_legacy_admin_role_id, v_perm_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'admin:user:2fa permission seeded successfully';
END $$;

-- Down Migration

-- Remove the admin:user:2fa permission (CASCADE removes role_permissions mappings)
DO $$
DECLARE
  v_app_id UUID;
BEGIN
  SELECT id INTO v_app_id
  FROM applications
  WHERE slug = 'porta-admin'
  LIMIT 1;

  IF v_app_id IS NOT NULL THEN
    DELETE FROM permissions
    WHERE application_id = v_app_id AND slug = 'admin:user:2fa';
  END IF;
END $$;
