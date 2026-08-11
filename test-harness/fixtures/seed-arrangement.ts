import { randomBytes } from 'node:crypto';

import {
  administrativeActors,
  alphaFixture,
  bravoFixture,
  fixtureProtocolScopes,
  publicFixtureManifest,
} from './fixture-definition.js';
import type { PublicFixtureManifest } from './fixture-assurance-contract.js';

/** Actual database identifiers corresponding to one public fixture alias. */
export interface SeededEntityReference {
  /** Stable public alias used by assurance scenarios. */
  readonly alias: string;
  /** Actual Porta identifier created in the disposable database. */
  readonly id: string;
}

/** Protected runtime material produced while arranging a fresh fixture baseline. */
export interface SeededFixtureRuntime {
  /** Public identifier-only fixture manifest. */
  readonly publicManifest: PublicFixtureManifest;
  /** Actual database identifiers keyed by stable public alias. */
  readonly entities: readonly SeededEntityReference[];
  /** Raw credentials keyed by opaque public reference; never serialize this map publicly. */
  readonly credentials: ReadonlyMap<string, string>;
  /** Retained browser configuration derived from the alpha fixture. */
  readonly retained: {
    readonly organizationSlug: 'alpha';
    readonly publicClientId: string;
    readonly confidentialClientId: string;
    readonly confidentialClientSecret: string;
    readonly userEmail: string;
    readonly userPassword: string;
  };
}

/** Public callback endpoints used while registering disposable fixture clients. */
export interface FixtureArrangementEndpoints {
  /** Retained SPA origin and callback host. */
  readonly appBaseUrl: string;
  /** Retained BFF origin and callback host. */
  readonly bffBaseUrl: string;
}

interface RuntimeUser {
  readonly alias: string;
  readonly id: string;
  readonly email: string;
}

interface RuntimeClient {
  readonly alias: string;
  readonly id: string;
  readonly clientId: string;
  readonly secret?: string;
}

/**
 * Builds a stable synthetic email address for an allowlisted ordinary-user alias.
 *
 * @param alias - Public fixture alias beginning with `alpha-user-` or `bravo-user-`.
 * @returns A non-production address in the harness-only domain.
 * @throws Error when the alias is outside the ordinary-user namespace.
 */
export function fixtureEmail(alias: string): string {
  if (!/^(?:alpha|bravo)-user-[a-z-]+$/u.test(alias)) {
    throw new Error(`unsupported ordinary fixture user alias: ${alias}`);
  }
  return `${alias}@test-harness.local`;
}

/** Returns cryptographically unpredictable opaque runtime material. */
function randomCredential(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Extracts a TOTP secret from the service-produced otpauth URI. */
function totpSecret(uri: string | undefined): string {
  if (uri === undefined) throw new Error('TOTP setup did not return an enrollment URI');
  const secret = new URL(uri).searchParams.get('secret');
  if (secret === null || secret.length === 0) throw new Error('TOTP enrollment URI omitted secret');
  return secret;
}

/**
 * Arranges the complete deterministic baseline in a fresh disposable Porta database.
 *
 * The caller must connect PostgreSQL and Redis first. The function creates or repairs fixture
 * records, hashes passwords and client secrets through Porta services, and returns raw values only
 * in an in-memory map for immediate transfer to owner-only runtime storage.
 *
 * @param endpoints - Exact retained-client callback origins owned by the active harness run.
 * @returns Public aliases, actual disposable identifiers, and protected run-local credentials.
 * @throws Error when bootstrap records are missing or any fixture cannot be arranged exactly.
 */
export async function arrangeFixtureBaseline(
  endpoints: FixtureArrangementEndpoints,
): Promise<SeededFixtureRuntime> {
  const { getPool } = await import('../../packages/server/src/lib/database.js');
  const { findSuperAdminOrganization } =
    await import('../../packages/server/src/organizations/repository.js');
  const { createOrganization, getOrganizationBySlug, updateOrganization } =
    await import('../../packages/server/src/organizations/index.js');
  const { createApplication, getApplicationBySlug } =
    await import('../../packages/server/src/applications/index.js');
  const { createClient, generateSecret, listClientsByApplication } =
    await import('../../packages/server/src/clients/index.js');
  const {
    createUser,
    getUserByEmail,
    lockUser,
    markEmailVerified,
    reactivateUser,
    setUserPassword,
    suspendUser,
  } = await import('../../packages/server/src/users/index.js');
  const {
    assignPermissionsToRole,
    assignRolesToUser,
    createPermission,
    createRole,
    findPermissionBySlug,
    findRoleBySlug,
  } = await import('../../packages/server/src/rbac/index.js');
  const { setupTotp } = await import('../../packages/server/src/two-factor/index.js');

  const pool = getPool();
  const credentials = new Map<string, string>();
  const entities: SeededEntityReference[] = [];
  const runtimePassword = `P-${randomCredential(24)}!aA7`;

  let application = await getApplicationBySlug('assurance-oidc');
  application ??= await createApplication({
    name: 'Assurance OIDC',
    slug: 'assurance-oidc',
    description: 'Disposable application for retained black-box assurance',
  });
  entities.push({ alias: 'assurance-oidc', id: application.id });

  const runtimeUsers = new Map<string, RuntimeUser>();
  const runtimeClients = new Map<string, RuntimeClient>();
  for (const fixture of [alphaFixture, bravoFixture]) {
    let organization = await getOrganizationBySlug(fixture.id);
    organization ??= await createOrganization({
      name: `Assurance ${fixture.id}`,
      slug: fixture.id,
      defaultLoginMethods: ['password', 'magic_link'],
    });
    await updateOrganization(organization.id, {
      defaultLoginMethods: ['password', 'magic_link'],
    });
    entities.push({ alias: fixture.id, id: organization.id });

    for (const userDefinition of fixture.users) {
      const email = fixtureEmail(userDefinition.id);
      let user = await getUserByEmail(organization.id, email);
      user ??= await createUser({
        organizationId: organization.id,
        email,
        givenName: fixture.id,
        familyName: userDefinition.id.slice(`${fixture.id}-user-`.length),
        password: runtimePassword,
      });
      await setUserPassword(user.id, runtimePassword);
      if (user.status === 'inactive') await reactivateUser(user.id);
      await markEmailVerified(user.id);
      if (userDefinition.state === 'locked' && user.status !== 'locked') {
        await lockUser(user.id, 'assurance fixture');
      }
      if (userDefinition.state === 'suspended' && user.status !== 'suspended') {
        await suspendUser(user.id, 'assurance fixture');
      }
      if (userDefinition.twoFactorEnabled && !user.twoFactorEnabled) {
        const setup = await setupTotp(user.id, email, fixture.id);
        const secret = totpSecret(setup.totpUri);
        await pool.query('UPDATE user_totp SET verified = TRUE WHERE user_id = $1', [user.id]);
        await pool.query(
          "UPDATE users SET two_factor_enabled = TRUE, two_factor_method = 'totp' WHERE id = $1",
          [user.id],
        );
        credentials.set(`credential:${fixture.id}:totp:two-factor`, secret);
        credentials.set(
          `credential:${fixture.id}:recovery:two-factor`,
          setup.recoveryCodes.join('\n'),
        );
      }
      credentials.set(userDefinition.passwordCredentialRef, runtimePassword);
      runtimeUsers.set(userDefinition.id, { alias: userDefinition.id, id: user.id, email });
      entities.push({ alias: userDefinition.id, id: user.id });
    }

    const existingClients = await listClientsByApplication(application.id, {
      page: 1,
      pageSize: 100,
    });
    for (const definition of fixture.clients.filter((entry) => entry.validity === 'valid')) {
      const name = `Assurance ${definition.id}`;
      const existing = existingClients.data.find(
        (candidate) =>
          candidate.clientName === name && candidate.organizationId === organization.id,
      );
      let client = existing;
      let secret: string | undefined;
      if (client === undefined) {
        const tenantAppBaseUrl =
          fixture.id === 'alpha'
            ? endpoints.appBaseUrl
            : endpoints.appBaseUrl.replace('app-harness.', 'bravo-app-harness.');
        const tenantBffBaseUrl =
          fixture.id === 'alpha'
            ? endpoints.bffBaseUrl
            : endpoints.bffBaseUrl.replace('app-harness.', 'bravo-app-harness.');
        const clientBaseUrl = definition.kind === 'public' ? tenantAppBaseUrl : tenantBffBaseUrl;
        const created = await createClient({
          organizationId: organization.id,
          applicationId: application.id,
          clientName: name,
          clientType: definition.kind,
          // OIDC client metadata permits only `web` or `native`; confidentiality is represented
          // separately by client_type, so browser public clients remain `web` here.
          applicationType: 'web',
          redirectUris: [
            definition.kind === 'public'
              ? `${clientBaseUrl}/callback.html`
              : `${clientBaseUrl}/callback`,
          ],
          postLogoutRedirectUris: [`${clientBaseUrl}/`],
          grantTypes: [...definition.grantTypes],
          scope: definition.scopes.join(' '),
          allowedOrigins: [clientBaseUrl],
          tokenEndpointAuthMethod: definition.kind === 'public' ? 'none' : 'client_secret_post',
          requirePkce: true,
        });
        client = created.client;
        secret = created.secret?.plaintext;
      }
      if (definition.kind === 'confidential') {
        secret ??= (await generateSecret(client.id)).plaintext;
        if (secret === undefined || definition.clientSecretCredentialRef === undefined) {
          throw new Error(`confidential client did not yield a protected secret: ${definition.id}`);
        }
        credentials.set(definition.clientSecretCredentialRef, secret);
      }
      runtimeClients.set(definition.id, {
        alias: definition.id,
        id: client.id,
        clientId: client.clientId,
        secret,
      });
      entities.push({ alias: definition.id, id: client.id });
    }

    const permissionSlug = 'assurance:resource:read';
    let permission = await findPermissionBySlug(application.id, permissionSlug);
    permission ??= await createPermission({
      applicationId: application.id,
      name: 'Read assurance resource',
      slug: permissionSlug,
    });
    const roleSlug = `${fixture.id}-resource-reader`;
    let role = await findRoleBySlug(application.id, roleSlug);
    role ??= await createRole({
      applicationId: application.id,
      name: `${fixture.id} resource reader`,
      slug: roleSlug,
    });
    await assignPermissionsToRole(role.id, [permission.id]);
    const activeUser = runtimeUsers.get(`${fixture.id}-user-active`);
    if (activeUser === undefined) throw new Error(`active fixture user missing: ${fixture.id}`);
    await assignRolesToUser(activeUser.id, [role.id]);
    entities.push({ alias: roleSlug, id: role.id });

    const publicClient = runtimeClients.get(`${fixture.id}-client-public`);
    if (publicClient === undefined) throw new Error(`public fixture client missing: ${fixture.id}`);
    const sessionValue = randomCredential();
    const tokenValue = randomCredential();
    await pool.query(
      `INSERT INTO admin_sessions
         (session_id, user_id, client_id, organization_id, grant_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour')
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionValue, activeUser.id, publicClient.id, organization.id, `${fixture.id}-grant`],
    );
    await pool.query(
      `INSERT INTO oidc_payloads (id, type, payload, grant_id, expires_at)
       VALUES ($1, 'AccessToken', $2::jsonb, $3, NOW() + INTERVAL '1 hour')
       ON CONFLICT (id, type) DO NOTHING`,
      [
        tokenValue,
        JSON.stringify({
          accountId: activeUser.id,
          clientId: publicClient.clientId,
          organizationId: organization.id,
          scope: fixtureProtocolScopes.join(' '),
        }),
        `${fixture.id}-grant`,
      ],
    );
    credentials.set(`credential:${fixture.id}:cookie:baseline`, sessionValue);
    credentials.set(`credential:${fixture.id}:token:baseline`, tokenValue);
    // Session and token identifiers are bearer credentials, so only their protected references
    // appear in the public fixture definition. The public entity index keeps the non-secret
    // resource association and never serializes those raw values.
    entities.push({ alias: `${fixture.id}-resource-primary`, id: activeUser.id });
  }

  const superAdminOrganization = await findSuperAdminOrganization();
  const adminApplication = await getApplicationBySlug('porta-admin');
  if (superAdminOrganization === null || adminApplication === null) {
    throw new Error('Porta bootstrap must create the super-admin organization and application');
  }
  entities.push(
    { alias: 'super-admin', id: superAdminOrganization.id },
    { alias: 'porta-admin', id: adminApplication.id },
  );

  for (const actor of administrativeActors) {
    const email = `${actor.id}@test-harness.local`;
    let user = await getUserByEmail(superAdminOrganization.id, email);
    user ??= await createUser({
      organizationId: superAdminOrganization.id,
      email,
      givenName: 'Assurance',
      familyName: actor.permissionSet,
      password: runtimePassword,
    });
    await setUserPassword(user.id, runtimePassword);
    if (user.status === 'inactive') await reactivateUser(user.id);
    await markEmailVerified(user.id);
    let role = await findRoleBySlug(adminApplication.id, actor.roleId);
    if (role === null && actor.permissionSet === 'unprivileged') {
      role = await createRole({
        applicationId: adminApplication.id,
        name: 'Assurance unprivileged',
        slug: actor.roleId,
        description: 'Authenticated negative-control role with no permissions',
      });
    }
    if (role === null) throw new Error(`Porta bootstrap role missing: ${actor.roleId}`);
    await assignRolesToUser(user.id, [role.id]);
    credentials.set(actor.passwordCredentialRef, runtimePassword);
    entities.push({ alias: actor.id, id: user.id }, { alias: actor.roleId, id: role.id });
  }

  const retainedUser = runtimeUsers.get('alpha-user-active');
  const retainedPublic = runtimeClients.get('alpha-client-public');
  const retainedConfidential = runtimeClients.get('alpha-client-confidential');
  if (
    retainedUser === undefined ||
    retainedPublic === undefined ||
    retainedConfidential === undefined ||
    retainedConfidential.secret === undefined
  ) {
    throw new Error('retained alpha browser fixtures are incomplete');
  }

  return {
    publicManifest: publicFixtureManifest,
    entities,
    credentials,
    retained: {
      organizationSlug: 'alpha',
      publicClientId: retainedPublic.clientId,
      confidentialClientId: retainedConfidential.clientId,
      confidentialClientSecret: retainedConfidential.secret,
      userEmail: retainedUser.email,
      userPassword: runtimePassword,
    },
  };
}
