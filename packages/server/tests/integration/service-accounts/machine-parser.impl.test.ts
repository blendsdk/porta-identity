import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase, disconnectDatabase, getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { setServiceAccount } from '../../../src/service-accounts/index.js';
import { createTestClaimDefinition } from '../helpers/factories.js';
import {
  createMachineHttpFixture, isRecord, issueMachineToken, machineRequest,
  machineTokenValue, readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';
import { readInvitationAudits } from './machine-invitation-fixtures.js';

/** Parser composition must retain the old human boundary while preserving machine JSON data. */
describe.sequential('machine invitation parser composition', () => {
  let fixture: MachineHttpFixture | undefined;
  beforeEach(async () => { fixture = await createMachineHttpFixture(); });
  afterEach(async () => { vi.useRealTimers(); await fixture?.close(); fixture = undefined; });

  /** Never continue a request with a partially constructed HTTP fixture. */
  function current(): MachineHttpFixture {
    if (!fixture) throw new Error('Parser fixture is unavailable');
    return fixture;
  }

  /** The canonical prefix is covered by retained Admin CORS and pre-authentication rate limiting. */
  function path(): string {
    return `/api/admin/organizations/${current().lifecycle.organization.id}/users/invite`;
  }

  /** Obtain a genuine machine artifact without printing a token response on failure. */
  async function token(): Promise<string> {
    const issued = await issueMachineToken(current());
    expect(issued.status).toBe(200);
    return machineTokenValue(issued);
  }

  /** Expire a genuine human model, not the fixture's deliberately external human lookup seam. */
  async function expiredHumanToken(): Promise<string> {
    const f = current();
    const client = await f.provider.Client.find(f.lifecycle.client.clientId);
    if (!client) throw new Error('Human token client is unavailable');
    const grant = new f.provider.Grant({ clientId: client.clientId, accountId: f.lifecycle.actor.id });
    grant.addOIDCScope('admin:user:invite');
    const grantId = await grant.save();
    const model = new f.provider.AccessToken({
      client, accountId: f.lifecycle.actor.id, grantId, gty: 'authorization_code', scope: 'admin:user:invite',
    });
    const opaque = await model.save();
    const persisted = await f.provider.AccessToken.find(opaque);
    if (!persisted || typeof persisted.exp !== 'number') throw new Error('Human token expiry is unavailable');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime((persisted.exp + 20) * 1000);
    return opaque;
  }

  /** Rejection must leave both invitation state and eagerly created users absent. */
  async function absent(email: string): Promise<void> {
    const f = current();
    expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
    expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
    expect(f.mail.attempts).toBe(0);
  }

  it('preserves escaped prototype-looking keys as opaque JSONB data without prototype mutation', async () => {
    const f = current();
    const claim = await createTestClaimDefinition(f.lifecycle.application.id, { claimType: 'json' });
    await setServiceAccount(f.lifecycle.client.id, { targets: [{ ...f.lifecycle.target,
      allowedClaimDefinitions: [{ applicationId: claim.applicationId, claimDefinitionId: claim.id }],
    }] }, f.lifecycle.actor);
    const email = `opaque-json-${randomUUID()}@example.test`;
    const raw = JSON.stringify({ email, claims: [{ applicationId: claim.applicationId,
      claimDefinitionId: claim.id, value: 0 }] }).replace('"value":0',
      '"value":{"__pr\\u006fto__":{"polluted":true},"items":[null,false,1,"text"]}');
    const response = await machineRequest(f, { method: 'POST', path: path(), token: await token(), rawBody: raw });
    expect(response.status).toBe(201);
    const invitation = await readMachineInvitation(f.lifecycle.organization.id, email);
    const claims = invitation?.details.claims;
    if (!Array.isArray(claims) || !isRecord(claims[0]) || !isRecord(claims[0].value)) {
      throw new Error('Persisted opaque claim is unavailable');
    }
    expect(Object.hasOwn(claims[0].value, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(claims[0].value) === Object.prototype).toBe(true);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(claims[0].value.items).toEqual([null, false, 1, 'text']);
  });

  it('retains human rejection of prototype-looking data before any mutation', async () => {
    const f = current();
    const email = `human-json-${randomUUID()}@example.test`;
    const response = await machineRequest(f, { method: 'POST', path: path(),
      token: f.humanToken(f.lifecycle.actor), rawBody: `{"email":"${email}","__proto__":{"polluted":true}}` });
    expect(response.status).toBe(400);
    await absent(email);
  });

  it.each(['missing', 'expired human', 'valid human'] as const)(
    'retains syntax and size error precedence for %s credentials', async (kind) => {
      const f = current();
      const credential = kind === 'missing' ? undefined : kind === 'expired human'
        ? await expiredHumanToken() : f.humanToken(f.lifecycle.actor);
      for (const [rawBody, status] of [['{', 400], [JSON.stringify({ padding: 'x'.repeat(100 * 1024) }), 413]] as const) {
        const response = await machineRequest(f, { method: 'POST', path: path(), token: credential, rawBody });
        expect(response.status).toBe(status);
        expect(Object.hasOwn(response.body, 'message')).toBe(false);
      }
      expect(f.mail.attempts).toBe(0);
      expect(await readInvitationAudits()).toHaveLength(0);
    },
  );

  it('retains 413 precedence even when authentication storage is unavailable', async () => {
    const f = current();
    const credential = f.humanToken(f.lifecycle.actor);
    await disconnectDatabase();
    try {
      const response = await machineRequest(f, { method: 'POST', path: path(), token: credential,
        rawBody: JSON.stringify({ padding: 'x'.repeat(100 * 1024) }) });
      expect(response.status).toBe(413);
      expect(response.text.includes('Database')).toBe(false);
    } finally { await connectDatabase(); }
    expect(f.mail.attempts).toBe(0);
  });

  it.each([false, true])('retains decompressed body limits with oversized=%s', async (oversized) => {
    const f = current();
    const email = `compressed-${randomUUID()}@example.test`;
    const raw = JSON.stringify({ email, ...(oversized ? { padding: 'x'.repeat(100 * 1024) } : {}) });
    const compressed = new Uint8Array(gzipSync(raw));
    const response = await fetch(`${f.baseUrl}${path()}`, { method: 'POST', body: compressed,
      headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', 'content-encoding': 'gzip' } });
    expect(response.status).toBe(oversized ? 413 : 201);
    await response.text();
    if (oversized) await absent(email);
    else expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
  });

  it('gives protected case and trailing-slash aliases exactly one outer audit owner', async () => {
    const f = current();
    const email = `alias-${randomUUID()}@example.test`;
    const alias = `/api/admin/ORGANIZATIONS/${f.lifecycle.organization.id}/USERS/INVITE/`;
    const response = await machineRequest(f, { method: 'POST', path: alias, token: await token(), body: { email } });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    expect((await readInvitationAudits()).map((row) => row.eventType).sort()).toEqual([
      'admin.mutation.committed', 'user.invited',
    ]);
    expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
  });

  it.each(['/API/admin', '/api/ADMIN'])('does not create an unprotected machine lane under %s', async (prefix) => {
    const f = current();
    const email = `prefix-${randomUUID()}@example.test`;
    const response = await machineRequest(f, { method: 'POST',
      path: `${prefix}/organizations/${f.lifecycle.organization.id}/users/invite`, token: await token(), body: { email } });
    expect(response.status).toBe(401);
    await absent(email);
  });

  it('does not expand historical human parser coverage on uppercase API aliases', async () => {
    const f = current();
    const email = `human-alias-${randomUUID()}@example.test`;
    const response = await machineRequest(f, { method: 'POST', path: path().replace('/api/', '/API/'),
      token: f.humanToken(f.lifecycle.actor), body: { email } });
    expect(response.status).toBe(400);
    await absent(email);
  });

  it('keeps preview on its original parser and human-only boundary', async () => {
    const f = current();
    const response = await machineRequest(f, { method: 'POST', path: `${path()}/preview`,
      token: await token(), rawBody: '{"__proto__":{"polluted":true}}' });
    expect(response.status).toBe(400);
    expect(f.mail.attempts).toBe(0);
  });

  it('rejects corrupt stored policy through safe HTTP storage failure without fallback', async () => {
    const f = current();
    const credential = await token();
    await getPool().query('UPDATE client_service_accounts SET targets = $1::jsonb WHERE client_id = $2',
      [JSON.stringify([{ organizationId: f.lifecycle.organization.id }]), f.lifecycle.client.id]);
    const email = `corrupt-${randomUUID()}@example.test`;
    const response = await machineRequest(f, { method: 'POST', path: path(), token: credential, body: { email } });
    expect(response.status).toBe(503);
    expect(response.text.includes('targets')).toBe(false);
    await absent(email);
  });

  it('fails closed on the exact native Redis lookup while human storage remains healthy', async () => {
    const f = current();
    const credential = await token();
    const native = await f.provider.ClientCredentials.find(credential);
    if (!native) throw new Error('Native lookup control is unavailable');
    const payload = await native.adapter.find(native.jti);
    if (!payload) throw new Error('Native lookup payload is unavailable');
    const key = `oidc:ClientCredentials:${native.jti}`;
    const redis = getRedis();
    await redis.del(key);
    await redis.lpush(key, 'owned-lookup-fault');
    try {
      const email = `native-storage-${randomUUID()}@example.test`;
      const response = await machineRequest(f, { method: 'POST', path: path(), token: credential, body: { email } });
      expect(response.status).toBe(503);
      expect(response.text.includes('WRONGTYPE')).toBe(false);
      await absent(email);
      const human = await machineRequest(f, { method: 'GET',
        path: `/api/admin/clients/${f.lifecycle.client.id}`, token: f.humanToken(f.lifecycle.actor) });
      expect(human.status).toBe(200);
    } finally {
      await redis.del(key);
      await native.adapter.upsert(native.jti, payload, native.remainingTTL);
    }
  });
});
