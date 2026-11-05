/** Stored native metadata must be complete, well typed and bound to the authenticating client. */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { updateClient } from '../../../src/clients/index.js';
import { generateAndStore } from '../../../src/clients/secret-service.js';
import { setServiceAccount } from '../../../src/service-accounts/index.js';
import { createTestClient } from '../helpers/factories.js';
import {
  createMachineHttpFixture, isRecord, issueMachineToken, machineInvitationRequest,
  machineTokenValue, readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';

let fixture: MachineHttpFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

/** Prove real invitation authority before changing only the owned native token payload. */
async function usableNativeToken(f: MachineHttpFixture) {
  const issued = await issueMachineToken(f);
  expect(issued.status).toBe(200);
  const token = machineTokenValue(issued);
  const email = `metadata-control-${randomUUID()}@example.test`;
  expect((await machineInvitationRequest(f, token, email)).status).toBe(201);
  expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
  expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
  const native = await f.provider.ClientCredentials.find(token);
  const metadata = native?.extra?.['urn:porta:service-account'];
  if (!native || !isRecord(metadata)) throw new Error('Native service metadata is missing');
  const payload = await native.adapter.find(native.jti);
  if (!payload) throw new Error('Native token payload is missing');
  return { token, native, metadata, payload };
}

/** Remove a required field without using a cast to manufacture the remaining shape. */
function withoutField(metadata: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...metadata };
  delete copy[key];
  return copy;
}

/** Denial must leave no invitation or eagerly provisioned target user. */
async function deniedInvitation(f: MachineHttpFixture, token: string, status: number): Promise<void> {
  const email = `metadata-denied-${randomUUID()}@example.test`;
  expect((await machineInvitationRequest(f, token, email)).status).toBe(status);
  expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
  expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
}

describe('native service metadata validation', () => {
  it.each(['entire extra', 'service namespace'] as const)(
    'should reject a previously usable token missing %s', async (missing) => {
      const f = fixture = await createMachineHttpFixture();
      const { token, native, payload } = await usableNativeToken(f);
      if (missing === 'entire extra') delete payload.extra;
      else payload.extra = {};
      await native.adapter.upsert(native.jti, payload, native.remainingTTL);
      await deniedInvitation(f, token, 401);
    },
  );

  const malformed = [
    ['null namespace', () => null],
    ['scalar namespace', () => 'invalid'],
    ['array namespace', () => []],
    ['empty namespace', () => ({})],
    ['missing account', (m: Record<string, unknown>) => withoutField(m, 'accountId')],
    ['missing binding', (m: Record<string, unknown>) => withoutField(m, 'bindingId')],
    ['missing version', (m: Record<string, unknown>) => withoutField(m, 'version')],
    ['numeric account', (m: Record<string, unknown>) => ({ ...m, accountId: 1 })],
    ['object binding', (m: Record<string, unknown>) => ({ ...m, bindingId: {} })],
    ['array version', (m: Record<string, unknown>) => ({ ...m, version: [] })],
    ['invalid account UUID', (m: Record<string, unknown>) => ({ ...m, accountId: 'not-a-uuid' })],
    ['invalid binding UUID', (m: Record<string, unknown>) => ({ ...m, bindingId: 'not-a-uuid' })],
    ['invalid version UUID', (m: Record<string, unknown>) => ({ ...m, version: 'not-a-uuid' })],
    ['unexpected identity field', (m: Record<string, unknown>) => ({ ...m, permissions: ['*'] })],
  ] as const;

  it.each(malformed)('should reject malformed native identity: %s', async (_label, change) => {
    const f = fixture = await createMachineHttpFixture();
    const { token, native, metadata, payload } = await usableNativeToken(f);
    payload.extra = { 'urn:porta:service-account': change(metadata) };
    await native.adapter.upsert(native.jti, payload, native.remainingTTL);
    await deniedInvitation(f, token, 401);
  });

  it.each(['accountId', 'bindingId', 'version'] as const)(
    'should deny a well-formed but mismatched %s', async (field) => {
      const f = fixture = await createMachineHttpFixture();
      const { token, native, metadata, payload } = await usableNativeToken(f);
      payload.extra = { 'urn:porta:service-account': { ...metadata, [field]: randomUUID() } };
      await native.adapter.upsert(native.jti, payload, native.remainingTTL);
      expect(await f.provider.ClientCredentials.find(token) !== undefined).toBe(true);
      await deniedInvitation(f, token, 403);
    },
  );

  it('should never promote an ordinary token issued before the first binding', async () => {
    const f = fixture = await createMachineHttpFixture({ bound: false });
    await updateClient(f.lifecycle.client.id, { scope: 'profile admin:user:invite' }, f.lifecycle.actor.id);
    const before = await issueMachineToken(f, { scope: 'profile' });
    expect(before.status).toBe(200);
    const oldToken = machineTokenValue(before);
    const oldNative = await f.provider.ClientCredentials.find(oldToken);
    expect(oldNative?.extra?.['urn:porta:service-account'] === undefined).toBe(true);
    await setServiceAccount(f.lifecycle.client.id, {
      accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target],
    }, f.lifecycle.actor);
    const freshSecret = await generateAndStore(f.lifecycle.client.id, {}, f.lifecycle.actor.id);
    await deniedInvitation(f, oldToken, 401);
    const fresh = await issueMachineToken(f, { secret: freshSecret.plaintext });
    expect(fresh.status).toBe(200);
    const email = `first-binding-${randomUUID()}@example.test`;
    expect((await machineInvitationRequest(f, machineTokenValue(fresh), email)).status).toBe(201);
    expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
    expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
  });

  it('should not accept another bound client carrying a copied valid identity triple', async () => {
    const f = fixture = await createMachineHttpFixture();
    const original = await usableNativeToken(f);
    const client = await createTestClient(f.lifecycle.adminOrganization.id, f.lifecycle.adminApplication.id, {
      grantTypes: ['client_credentials'], responseTypes: [], scope: 'admin:user:invite',
    });
    await setServiceAccount(client.id, {
      accountEmail: `second-binding-${randomUUID()}@example.test`, targets: [f.lifecycle.target],
    }, f.lifecycle.actor);
    const secret = await generateAndStore(client.id, {}, f.lifecycle.actor.id);
    const issued = await issueMachineToken(f, { clientId: client.clientId, secret: secret.plaintext });
    expect(issued.status).toBe(200);
    const token = machineTokenValue(issued);
    const email = `second-control-${randomUUID()}@example.test`;
    expect((await machineInvitationRequest(f, token, email)).status).toBe(201);
    expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
    expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
    const native = await f.provider.ClientCredentials.find(token);
    if (!native) throw new Error('Second native token is missing');
    const payload = await native.adapter.find(native.jti);
    if (!payload) throw new Error('Second native payload is missing');
    payload.extra = { 'urn:porta:service-account': original.metadata };
    await native.adapter.upsert(native.jti, payload, native.remainingTTL);
    await deniedInvitation(f, token, 403);
  });
});
