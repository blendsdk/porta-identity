/**
 * Client repository integration tests.
 *
 * Verifies CRUD operations against a real PostgreSQL database.
 * Tests cover: insert, find by ID/clientId, client_id uniqueness,
 * update, list by org/app, secret CRUD, secret verification,
 * cascade delete, and revoked client filtering.
 *
 * Each test starts with a clean slate via truncateAllTables().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClient,
  createTestClientWithSecret,
  buildClientInput,
} from '../helpers/factories.js';
import {
  insertClient,
  findClientById,
  findClientByClientId,
  updateClient,
  listClients,
} from '../../../src/clients/repository.js';
import {
  insertSecret,
  listSecretsByClient,
  revokeSecret,
  getActiveSecretHashes,
} from '../../../src/clients/secret-repository.js';
import { generateSecret, hashSecret, verifySecretHash } from '../../../src/clients/crypto.js';
import { getPool } from '../../../src/lib/database.js';

describe('Client Repository (Integration)', () => {
  // Shared org and app for client tests — clients require both FKs
  let orgId: string;
  let appId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    // Create prerequisite org and app for FK constraints
    const org = await createTestOrganization();
    const app = await createTestApplication();
    orgId = org.id;
    appId = app.id;
  });

  // ── Insert & Find ────────────────────────────────────────────

  it('should insert and retrieve a client by ID', async () => {
    const client = await createTestClient(orgId, appId);

    const found = await findClientById(client.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(client.id);
    expect(found!.clientName).toBe(client.clientName);
    expect(found!.clientType).toBe('confidential');
    expect(found!.status).toBe('active');
    expect(found!.createdAt).toBeInstanceOf(Date);
  });

  it('should insert and retrieve a client by clientId', async () => {
    const client = await createTestClient(orgId, appId);

    const found = await findClientByClientId(client.clientId);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(client.id);
    expect(found!.clientId).toBe(client.clientId);
  });

  // ── client_id Uniqueness ─────────────────────────────────────

  it('should reject duplicate client_id values', async () => {
    const input = buildClientInput(orgId, appId, { clientId: 'duplicate-client-id' });
    await insertClient(input);

    const input2 = buildClientInput(orgId, appId, { clientId: 'duplicate-client-id' });
    await expect(insertClient(input2)).rejects.toThrow(/duplicate key|unique/i);
  });

  // ── Update ───────────────────────────────────────────────────

  it('should update client fields', async () => {
    const client = await createTestClient(orgId, appId);

    const updated = await updateClient(client.id, {
      clientName: 'Updated Client',
      redirectUris: ['http://localhost:4000/callback'],
    });

    expect(updated.clientName).toBe('Updated Client');
    expect(updated.redirectUris).toEqual(['http://localhost:4000/callback']);
    expect(updated.clientId).toBe(client.clientId);
  });

  // ── List ─────────────────────────────────────────────────────

  it('should list clients by organization', async () => {
    await createTestClient(orgId, appId);
    await createTestClient(orgId, appId);

    // Create a client in a different org — should not appear
    const otherOrg = await createTestOrganization();
    await createTestClient(otherOrg.id, appId);

    const result = await listClients({
      page: 1,
      pageSize: 50,
      organizationId: orgId,
    });

    expect(result.data).toHaveLength(2);
    expect(result.data.every((c) => c.organizationId === orgId)).toBe(true);
  });

  it('should list clients by application', async () => {
    await createTestClient(orgId, appId);

    // Create a client for a different app
    const otherApp = await createTestApplication();
    await createTestClient(orgId, otherApp.id);

    const result = await listClients({
      page: 1,
      pageSize: 50,
      applicationId: appId,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].applicationId).toBe(appId);
  });

  // ── Client Secret CRUD ───────────────────────────────────────

  it('should insert, list, and revoke client secrets', async () => {
    const client = await createTestClient(orgId, appId);

    // Insert a secret hash
    const plain = generateSecret();
    const hash = await hashSecret(plain);
    const secret = await insertSecret({
      clientId: client.id,
      secretHash: hash,
      label: 'primary',
      expiresAt: null,
    });
    expect(secret.id).toBeDefined();
    expect(secret.label).toBe('primary');
    expect(secret.status).toBe('active');

    // List secrets
    const secrets = await listSecretsByClient(client.id);
    expect(secrets).toHaveLength(1);

    // Revoke secret
    await revokeSecret(secret.id);
    const afterRevoke = await listSecretsByClient(client.id);
    expect(afterRevoke[0].status).toBe('revoked');
  });

  // ── Secret Verification ──────────────────────────────────────

  it('should verify secrets against stored hashes', async () => {
    const { client, clientSecret } = await createTestClientWithSecret(orgId, appId);

    // Get active secret hashes
    const hashes = await getActiveSecretHashes(client.id);
    expect(hashes).toHaveLength(1);

    // Verify the plaintext secret against the stored hash
    const isValid = await verifySecretHash(hashes[0].hash, clientSecret);
    expect(isValid).toBe(true);

    // Wrong secret should fail
    const isInvalid = await verifySecretHash(hashes[0].hash, 'wrong-secret');
    expect(isInvalid).toBe(false);
  });

  // ── Cascade Delete ───────────────────────────────────────────

  it('should cascade delete clients and secrets when org is deleted', async () => {
    const { client } = await createTestClientWithSecret(orgId, appId);
    const pool = getPool();

    // Verify client exists
    expect(await findClientById(client.id)).not.toBeNull();

    // Delete org — should cascade to clients and their secrets
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);

    expect(await findClientById(client.id)).toBeNull();

    // Secrets should be gone too
    const secrets = await listSecretsByClient(client.id);
    expect(secrets).toHaveLength(0);
  });

  // ── Revoked Client ───────────────────────────────────────────

  it('should handle revoked client status', async () => {
    const client = await createTestClient(orgId, appId);

    // Revoke the client
    const revoked = await updateClient(client.id, { status: 'revoked' });
    expect(revoked.status).toBe('revoked');

    // Client should still be findable by ID (status filtering is service-layer logic)
    const found = await findClientById(client.id);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('revoked');
  });
});
