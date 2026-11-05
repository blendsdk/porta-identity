import { getPool } from '../../../src/lib/database.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClaimDefinition,
  createTestClientWithSecret,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';

/** Canonical role identities supplied by the administrative account contract. */
export const LIFECYCLE_ROLES = {
  superAdmin: 'porta-super-admin',
  legacySuperAdmin: 'porta-admin',
  appAdmin: 'porta-app-admin',
  userAdmin: 'porta-user-admin',
  service: 'porta-invite-service',
} as const;

/** Exact public lifecycle projection; internal versions and credentials never belong in it. */
export const LIFECYCLE_BINDING_KEYS = [
  'accountEmail', 'clientId', 'createdAt', 'id', 'serviceAccountId', 'status', 'targets', 'updatedAt',
] as const;

/** A synthetic human identity whose claimed roles must still be checked in storage. */
export interface LifecycleActor {
  /** Existing user's database identity. */
  id: string;
  /** Synthetic email belonging to that user. */
  email: string;
  /** Organization claimed by the authenticated identity. */
  organizationId: string;
  /** Claimed role slugs, not a durable authorization snapshot. */
  roles: string[];
  /** Minimal independently specified operation permission. */
  permissions: readonly string[];
}

/** Non-secret account fields and live memberships used by lifecycle assertions. */
interface AccountState {
  /** Real user identity, preserved across revoke and restore. */
  id: string;
  /** Owning organization from authoritative storage. */
  organizationId: string;
  /** Normalized synthetic address. */
  email: string;
  /** Current database lifecycle state. */
  status: string;
  /** Permanent internal noninteractive classification. */
  isServiceAccount: boolean;
  /** Whether password storage is empty, without returning its contents. */
  passwordAbsent: boolean;
  /** Complete canonical application memberships and their current permissions. */
  roles: {
    /** Membership's role identity. */
    id: string;
    /** Application that owns the role. */
    applicationId: string;
    /** Current role slug. */
    slug: string;
    /** Every permission currently granted by the role. */
    permissions: string[];
  }[];
}

/** Audit identity plus serialized attribution, without depending on metadata key names. */
interface AuditState {
  /** Durable audit identity used to distinguish newly committed events. */
  id: string;
  /** Human who initiated the management mutation. */
  actorId: string | null;
  /** Existing audit actor classification. */
  actorType: string;
  /** Complete serialized attribution, compared without printing sensitive values. */
  details: string;
}

/** Secret identifiers and retirement state; secret material is deliberately excluded. */
interface SecretState {
  /** Existing credential identity. */
  id: string;
  /** Current active or revoked state. */
  status: string;
  /** Existing credential expiry, which lifecycle replacement must preserve. */
  expiresAt: Date | null;
}

/**
 * Seed independent control-plane definitions and one eligible client.
 * No target-application membership is created: assignment definitions are global.
 */
export async function createLifecycleFixture() {
  await truncateAllTables();
  await seedBaseData();
  const adminOrganizations = await getPool().query<{ id: string }>(
    'SELECT id FROM organizations WHERE is_super_admin = TRUE',
  );
  const adminOrganization = adminOrganizations.rows[0];
  if (!adminOrganization) throw new Error('Missing synthetic administrative organization');

  const adminApplication = await createTestApplication({
    slug: 'porta-admin',
    name: 'Synthetic administration',
  });
  const superRole = await createTestRole(adminApplication.id, {
    slug: LIFECYCLE_ROLES.superAdmin,
  });
  const legacyRole = await createTestRole(adminApplication.id, {
    slug: LIFECYCLE_ROLES.legacySuperAdmin,
  });
  const appAdminRole = await createTestRole(adminApplication.id, {
    slug: LIFECYCLE_ROLES.appAdmin,
  });
  const userAdminRole = await createTestRole(adminApplication.id, {
    slug: LIFECYCLE_ROLES.userAdmin,
  });
  const serviceRole = await createTestRole(adminApplication.id, {
    slug: LIFECYCLE_ROLES.service,
  });
  const invitePermission = await createTestPermission(adminApplication.id, {
    slug: 'admin:user:invite',
  });
  await getPool().query(
    'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
    [serviceRole.id, invitePermission.id],
  );
  const actor = await createLifecycleActor(adminOrganization.id, superRole);
  const { client, clientSecret } = await createTestClientWithSecret(
    adminOrganization.id,
    adminApplication.id,
    {
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      scope: 'openid admin:user:invite',
      tokenEndpointAuthMethod: 'client_secret_basic',
    },
  );
  const organization = await createTestOrganization();
  const otherOrganization = await createTestOrganization();
  const application = await createTestApplication();
  const otherApplication = await createTestApplication();
  const role = await createTestRole(application.id);
  const otherRole = await createTestRole(otherApplication.id);
  const claim = await createTestClaimDefinition(application.id);
  const otherClaim = await createTestClaimDefinition(otherApplication.id);
  const target = {
    organizationId: organization.id,
    allowedRoles: [{ applicationId: application.id, roleId: role.id }],
    allowedClaimDefinitions: [{ applicationId: application.id, claimDefinitionId: claim.id }],
  };
  const otherTarget = {
    organizationId: otherOrganization.id,
    allowedRoles: [{ applicationId: otherApplication.id, roleId: otherRole.id }],
    allowedClaimDefinitions: [
      { applicationId: otherApplication.id, claimDefinitionId: otherClaim.id },
    ],
  };
  return {
    adminOrganization, adminApplication, superRole, legacyRole, appAdminRole, userAdminRole,
    serviceRole, invitePermission, actor, client, oldSecret: clientSecret,
    organization, otherOrganization, application, otherApplication,
    role, otherRole, claim, otherClaim, target, otherTarget,
    accountEmail: 'invitation-automation@test.example.com',
  };
}

/** Independently seeded entities shared by these focused lifecycle specifications. */
export type LifecycleFixture = Awaited<ReturnType<typeof createLifecycleFixture>>;

/** Distinct live-authority failures, including actor snapshots that falsely claim Super Admin. */
export const LIFECYCLE_DENIED_ACTORS = [
  'application administrator',
  'user administrator',
  'outside organization',
  'classified user',
  'inactive user',
  'deleted user',
  'claimed role without assignment',
  'role in another application',
  'forged organization claim',
] as const;

/** One independently constructed reason a claimed administrator is not a live human Super Admin. */
export type DeniedLifecycleActorCase = typeof LIFECYCLE_DENIED_ACTORS[number];

/** Build denied identities in real storage before the test captures its no-mutation baseline. */
export async function createDeniedLifecycleActor(
  fixture: LifecycleFixture,
  actorCase: DeniedLifecycleActorCase,
): Promise<LifecycleActor> {
  if (actorCase === 'application administrator') {
    return createLifecycleActor(fixture.adminOrganization.id, fixture.appAdminRole);
  }
  if (actorCase === 'user administrator') {
    return createLifecycleActor(fixture.adminOrganization.id, fixture.userAdminRole);
  }
  if (actorCase === 'outside organization' || actorCase === 'forged organization claim') {
    const actor = await createLifecycleActor(fixture.organization.id, fixture.superRole);
    return actorCase === 'forged organization claim'
      ? { ...actor, organizationId: fixture.adminOrganization.id }
      : actor;
  }
  if (actorCase === 'role in another application') {
    const role = await createTestRole(fixture.application.id, { slug: LIFECYCLE_ROLES.superAdmin });
    return createLifecycleActor(fixture.adminOrganization.id, role);
  }
  const actor = await createLifecycleActor(fixture.adminOrganization.id, fixture.superRole);
  if (actorCase === 'classified user') {
    await getPool().query('UPDATE users SET is_service_account = TRUE WHERE id = $1', [actor.id]);
  } else if (actorCase === 'inactive user') {
    await getPool().query("UPDATE users SET status = 'inactive' WHERE id = $1", [actor.id]);
  } else if (actorCase === 'deleted user') {
    await getPool().query('DELETE FROM users WHERE id = $1', [actor.id]);
  } else {
    await getPool().query('DELETE FROM user_roles WHERE user_id = $1', [actor.id]);
  }
  return actor;
}

/**
 * Create a real user and role assignment, rather than trusting only an actor object's claims.
 * The returned identity can deliberately be made stale by a test after this insertion.
 */
export async function createLifecycleActor(
  organizationId: string,
  role: { id: string; slug: string },
): Promise<LifecycleActor> {
  const user = await createTestUser(organizationId);
  await getPool().query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [user.id, role.id]);
  return {
    id: user.id,
    email: user.email,
    organizationId,
    roles: [role.slug],
    permissions: ['admin:user:invite'],
  };
}

/** Read live account classification and effective role permissions without reading password hashes. */
export async function readLifecycleAccount(accountId: string): Promise<AccountState | null> {
  const result = await getPool().query<AccountState>(`
    SELECT u.id, u.organization_id AS "organizationId", u.email::text, u.status,
           u.is_service_account AS "isServiceAccount",
           (u.password_hash IS NULL) AS "passwordAbsent",
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'applicationId', r.application_id, 'slug', r.slug,
               'permissions', COALESCE((
                 SELECT jsonb_agg(p.slug ORDER BY p.slug)
                 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                 WHERE rp.role_id = r.id
               ), '[]'::jsonb)
             ) ORDER BY r.id)
             FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id
           ), '[]'::jsonb) AS roles
    FROM users u WHERE u.id = $1
  `, [accountId]);
  return result.rows[0] ?? null;
}

/** Read audit attribution without requiring an unapproved event name or metadata layout. */
export async function readLifecycleAudits(): Promise<AuditState[]> {
  const result = await getPool().query<AuditState>(`
    SELECT a.id, a.actor_id AS "actorId", a.actor_type AS "actorType", to_jsonb(a)::text AS details
    FROM audit_log a ORDER BY a.id
  `);
  return result.rows;
}

/** Read all current and retired secret identities, without exposing hashes or plaintext. */
export async function readLifecycleSecrets(clientId: string): Promise<SecretState[]> {
  const result = await getPool().query<SecretState>(`
    SELECT id, status, expires_at AS "expiresAt" FROM client_secrets WHERE client_id = $1 ORDER BY id
  `, [clientId]);
  return result.rows;
}

/**
 * Fingerprint complete security rows so rejected operations cannot hide partial changes.
 * Hashes remain inside PostgreSQL; assertion failures can print only this opaque digest.
 */
export async function lifecycleSecurityFingerprint(): Promise<string> {
  const result = await getPool().query<{ fingerprint: string }>(`
    SELECT md5(jsonb_build_array(
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM users t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM user_roles t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM roles t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM permissions t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM role_permissions t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM clients t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM client_secrets t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM client_service_accounts t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM audit_log t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM organizations t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM applications t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM custom_claim_definitions t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM custom_claim_values t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM invitation_tokens t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM magic_link_tokens t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM password_reset_tokens t),
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM auth_recovery_jobs t)
    )::text) AS fingerprint
  `);
  return result.rows[0].fingerprint;
}

/**
 * Reject real audit inserts while the callback performs its lifecycle mutation.
 * The owned trigger and function are removed even when an assertion fails.
 */
export async function withRejectedLifecycleAudit(operation: () => Promise<void>): Promise<void> {
  await getPool().query(`
    CREATE FUNCTION lifecycle_spec_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Synthetic lifecycle audit rejection';
    END;
    $$
  `);
  let triggerCreated = false;
  try {
    await getPool().query(`
      CREATE TRIGGER lifecycle_spec_reject_audit
      BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION lifecycle_spec_reject_audit()
    `);
    triggerCreated = true;
    await operation();
  } finally {
    try {
      if (triggerCreated) {
        await getPool().query('DROP TRIGGER lifecycle_spec_reject_audit ON audit_log');
      }
    } finally {
      await getPool().query('DROP FUNCTION lifecycle_spec_reject_audit()');
    }
  }
}
