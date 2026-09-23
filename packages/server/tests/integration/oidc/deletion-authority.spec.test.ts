import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cacheClient } from '../../../src/clients/cache.js';
import { findForOidc } from '../../../src/clients/service.js';
import { setCachedDefinitions } from '../../../src/custom-claims/cache.js';
import { buildCustomClaims } from '../../../src/custom-claims/service.js';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { upsertSession } from '../../../src/lib/session-tracking.js';
import { createAdapterFactory } from '../../../src/oidc/adapter-factory.js';
import type { AdapterPayload } from '../../../src/oidc/postgres-adapter.js';
import { PostgresAdapter } from '../../../src/oidc/postgres-adapter.js';
import { RedisAdapter } from '../../../src/oidc/redis-adapter.js';
import { setCachedUserPermissions, setCachedUserRoles } from '../../../src/rbac/cache.js';
import { buildPermissionClaims, buildRoleClaims } from '../../../src/rbac/user-role-service.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClaimDefinition,
  createTestClient,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

/** A stored authority graph used by one cached OIDC artifact. */
interface ArtifactAuthority {
  readonly accountId: string;
  readonly clientId: string;
  readonly clientRecordId: string;
  readonly grantId: string;
  readonly organizationId: string;
}

/** Create the database records referenced by a cached OIDC artifact. */
async function createArtifactAuthority(label: string): Promise<ArtifactAuthority> {
  const organization = await createTestOrganization({ name: `${label} organization` });
  const application = await createTestApplication({ name: `${label} application` });
  const user = await createTestUser(organization.id);
  const client = await createTestClient(organization.id, application.id);
  const grantId = randomUUID();

  await new PostgresAdapter('Grant').upsert(
    grantId,
    { accountId: user.id, clientId: client.clientId, kind: 'Grant' },
    3600,
  );

  return {
    accountId: user.id,
    clientId: client.clientId,
    clientRecordId: client.id,
    grantId,
    organizationId: organization.id,
  };
}

/** Store a Redis-backed artifact with every database authority reference populated. */
async function storeCachedArtifact(
  model: string,
  id: string,
  authority: ArtifactAuthority,
  lookup: { readonly uid: string; readonly userCode: string },
): Promise<void> {
  const Adapter = createAdapterFactory();
  const adapter = new Adapter(model);
  await adapter.upsert(
    id,
    {
      accountId: authority.accountId,
      clientId: authority.clientId,
      grantId: authority.grantId,
      kind: model,
      uid: lookup.uid,
      userCode: lookup.userCode,
    },
    3600,
  );
}

/** Read a cached artifact through one of the three OIDC adapter lookup methods. */
async function readCachedArtifact(
  method: 'find' | 'findByUid' | 'findByUserCode',
  model: string,
  lookup: { readonly id: string; readonly uid: string; readonly userCode: string },
): Promise<AdapterPayload | undefined> {
  const Adapter = createAdapterFactory();
  const adapter = new Adapter(model);

  if (method === 'findByUid') return adapter.findByUid(lookup.uid);
  if (method === 'findByUserCode') return adapter.findByUserCode(lookup.userCode);
  return adapter.find(lookup.id);
}

beforeEach(async () => {
  await getPool().query('TRUNCATE TABLE admin_sessions');
  await truncateAllTables();
  await flushTestRedis();
});

describe('live PostgreSQL authority for cached OIDC state', () => {
  describe('Session tracking', () => {
    // A Redis Session must never be published when its authoritative tracking row cannot persist.
    it('should reject Redis Session publication when PostgreSQL tracking cannot be persisted', async () => {
      const missingUserId = randomUUID();
      const sessionId = randomUUID();
      const adapter = new RedisAdapter('Session');

      await expect(
        adapter.upsert(sessionId, { accountId: missingUserId, kind: 'Session' }, 3600),
      ).rejects.toThrow();
      expect(await getRedis().exists(`oidc:Session:${sessionId}`)).toBe(0);
    });

    // A tracking row without a Redis payload is inert and cannot authenticate a request.
    it('should return no Session when only an orphaned PostgreSQL tracking row remains', async () => {
      const sessionId = randomUUID();
      await upsertSession({ sessionId, expiresAt: new Date(Date.now() + 3600_000) });

      await expect(new RedisAdapter('Session').find(sessionId)).resolves.toBeUndefined();
    });

    // Missing, expired, and revoked tracking remove cached authority without affecting a live Session.
    it('should reject invalid Session tracking while preserving an unrelated live Session', async () => {
      const organization = await createTestOrganization();
      const users = await Promise.all([
        createTestUser(organization.id),
        createTestUser(organization.id),
        createTestUser(organization.id),
        createTestUser(organization.id),
      ]);
      const sessions = users.map((user) => ({
        id: randomUUID(),
        uid: randomUUID(),
        userCode: randomUUID(),
        user,
      }));
      const adapter = new RedisAdapter('Session');

      for (const session of sessions) {
        await adapter.upsert(
          session.id,
          {
            accountId: session.user.id,
            kind: 'Session',
            uid: session.uid,
            userCode: session.userCode,
          },
          3600,
        );
        await upsertSession({
          sessionId: session.id,
          userId: session.user.id,
          organizationId: organization.id,
          expiresAt: new Date(Date.now() + 3600_000),
        });
      }

      await getPool().query('DELETE FROM admin_sessions WHERE session_id = $1', [sessions[0].id]);
      await getPool().query(
        `UPDATE admin_sessions
         SET created_at = NOW() - INTERVAL '2 hours',
             expires_at = NOW() - INTERVAL '1 hour'
         WHERE session_id = $1`,
        [sessions[1].id],
      );
      await getPool().query('UPDATE admin_sessions SET revoked_at = NOW() WHERE session_id = $1', [
        sessions[2].id,
      ]);

      await expect(adapter.find(sessions[0].id)).resolves.toBeUndefined();
      await expect(adapter.findByUid(sessions[1].uid)).resolves.toBeUndefined();
      await expect(adapter.findByUserCode(sessions[2].userCode)).resolves.toBeUndefined();
      await expect(adapter.find(sessions[3].id)).resolves.toMatchObject({
        accountId: sessions[3].user.id,
      });
    });
  });

  describe('Client metadata', () => {
    // OIDC client lookup must ignore stale Redis metadata after the database record disappears.
    it('should reject stale client metadata while preserving an unrelated live client', async () => {
      const organization = await createTestOrganization();
      const application = await createTestApplication();
      const deletedClient = await createTestClient(organization.id, application.id);
      const liveClient = await createTestClient(organization.id, application.id);
      await cacheClient(deletedClient);
      await cacheClient(liveClient);

      await getPool().query('DELETE FROM clients WHERE id = $1', [deletedClient.id]);

      await expect(findForOidc(deletedClient.clientId)).resolves.toBeUndefined();
      await expect(findForOidc(liveClient.clientId)).resolves.toMatchObject({
        client_id: liveClient.clientId,
      });
    });
  });

  describe('cached adapter artifacts', () => {
    const cases = [
      { authority: 'account', method: 'find' },
      { authority: 'client', method: 'findByUid' },
      { authority: 'grant', method: 'findByUserCode' },
    ] as const;

    for (const testCase of cases) {
      // Every cached read must re-check each referenced record against live PostgreSQL state.
      it(`should reject deleted ${testCase.authority} authority when ${testCase.method} reads cached data`, async () => {
        const deletedAuthority = await createArtifactAuthority('deleted');
        const liveAuthority = await createArtifactAuthority('live');
        const deletedLookup = { id: randomUUID(), uid: randomUUID(), userCode: randomUUID() };
        const liveLookup = { id: randomUUID(), uid: randomUUID(), userCode: randomUUID() };
        await storeCachedArtifact(
          'AuthorizationCode',
          deletedLookup.id,
          deletedAuthority,
          deletedLookup,
        );
        await storeCachedArtifact('AuthorizationCode', liveLookup.id, liveAuthority, liveLookup);

        if (testCase.authority === 'account') {
          await getPool().query('DELETE FROM users WHERE id = $1', [deletedAuthority.accountId]);
        } else if (testCase.authority === 'client') {
          await getPool().query('DELETE FROM clients WHERE id = $1', [
            deletedAuthority.clientRecordId,
          ]);
        } else {
          await getPool().query("DELETE FROM oidc_payloads WHERE id = $1 AND type = 'Grant'", [
            deletedAuthority.grantId,
          ]);
        }

        await expect(
          readCachedArtifact(testCase.method, 'AuthorizationCode', deletedLookup),
        ).resolves.toBeUndefined();
        await expect(
          readCachedArtifact(testCase.method, 'AuthorizationCode', liveLookup),
        ).resolves.toMatchObject({ accountId: liveAuthority.accountId });
      });
    }

    // Session authorization maps carry additional client and grant references beyond top-level fields.
    it('should reject a deleted Session authorization pair while preserving an unrelated pair', async () => {
      const deletedAuthority = await createArtifactAuthority('deleted authorization');
      const liveAuthority = await createArtifactAuthority('live authorization');
      const deletedSessionId = randomUUID();
      const liveSessionId = randomUUID();
      const Adapter = createAdapterFactory();
      const sessionAdapter = new Adapter('Session');

      await sessionAdapter.upsert(
        deletedSessionId,
        {
          accountId: deletedAuthority.accountId,
          authorizations: {
            [deletedAuthority.clientId]: { grantId: deletedAuthority.grantId },
          },
          kind: 'Session',
        },
        3600,
      );
      await sessionAdapter.upsert(
        liveSessionId,
        {
          accountId: liveAuthority.accountId,
          authorizations: { [liveAuthority.clientId]: { grantId: liveAuthority.grantId } },
          kind: 'Session',
        },
        3600,
      );
      await upsertSession({
        sessionId: deletedSessionId,
        userId: deletedAuthority.accountId,
        organizationId: deletedAuthority.organizationId,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      await upsertSession({
        sessionId: liveSessionId,
        userId: liveAuthority.accountId,
        organizationId: liveAuthority.organizationId,
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await getPool().query('DELETE FROM clients WHERE id = $1', [deletedAuthority.clientRecordId]);

      await expect(sessionAdapter.find(deletedSessionId)).resolves.toBeUndefined();
      await expect(sessionAdapter.find(liveSessionId)).resolves.toMatchObject({
        accountId: liveAuthority.accountId,
      });
    });
  });

  describe('token claims', () => {
    // Deleted assignments must not survive in claims merely because Redis still holds their slugs.
    it('should omit deleted RBAC assignments while preserving an unrelated user claims', async () => {
      const application = await createTestApplication();
      const organization = await createTestOrganization();
      const deletedUser = await createTestUser(organization.id);
      const liveUser = await createTestUser(organization.id);
      const role = await createTestRole(application.id, { slug: 'authority-role' });
      const permission = await createTestPermission(application.id, { slug: 'authority:read' });
      await getPool().query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
        [role.id, permission.id],
      );
      await getPool().query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2), ($3, $2)', [
        deletedUser.id,
        role.id,
        liveUser.id,
      ]);
      await setCachedUserRoles(deletedUser.id, [role.slug]);
      await setCachedUserPermissions(deletedUser.id, [permission.slug]);

      await getPool().query('DELETE FROM user_roles WHERE user_id = $1', [deletedUser.id]);

      await expect(buildRoleClaims(deletedUser.id, application.id)).resolves.toEqual([]);
      await expect(buildPermissionClaims(deletedUser.id, application.id)).resolves.toEqual([]);
      await expect(buildRoleClaims(liveUser.id, application.id)).resolves.toEqual([role.slug]);
      await expect(buildPermissionClaims(liveUser.id, application.id)).resolves.toEqual([
        permission.slug,
      ]);
    });

    // Claim issuance must use live definitions and values while retaining unrelated live claims.
    it('should omit a deleted custom claim while preserving an unrelated live claim', async () => {
      const application = await createTestApplication();
      const organization = await createTestOrganization();
      const user = await createTestUser(organization.id);
      const deletedClaim = await createTestClaimDefinition(application.id, {
        claimName: 'deleted_claim',
        includeInIdToken: true,
      });
      const liveClaim = await createTestClaimDefinition(application.id, {
        claimName: 'live_claim',
        includeInIdToken: true,
      });
      await getPool().query(
        `INSERT INTO custom_claim_values (user_id, claim_id, value)
         VALUES ($1, $2, $3::jsonb), ($1, $4, $5::jsonb)`,
        [user.id, deletedClaim.id, JSON.stringify('stale'), liveClaim.id, JSON.stringify('live')],
      );
      await setCachedDefinitions(application.id, [deletedClaim, liveClaim]);

      await getPool().query('DELETE FROM custom_claim_definitions WHERE id = $1', [
        deletedClaim.id,
      ]);

      await expect(buildCustomClaims(user.id, application.id, 'id_token')).resolves.toEqual({
        live_claim: 'live',
      });
    });
  });
});
