/** Native machine issuance has a bounded lifetime without changing ordinary token classes. */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateClient } from '../../../src/clients/index.js';
import { findServiceAccountByClientId } from '../../../src/service-accounts/index.js';
import { createTestClientWithSecret } from '../helpers/factories.js';
import {
  createMachineHttpFixture, isRecord, issueMachineToken, machineInvitationRequest,
  machineTokenValue, readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';

let fixture: MachineHttpFixture | undefined;

afterEach(async () => {
  vi.useRealTimers();
  await fixture?.close();
  fixture = undefined;
});

describe('native invitation token issuance', () => {
  it.each(['client_secret_basic', 'client_secret_post'] as const)(
    'should issue a real opaque five-minute token through %s', async (method) => {
      const f = fixture = await createMachineHttpFixture({ method });
      const issued = await issueMachineToken(f);
      expect(issued.status).toBe(200);
      expect(issued.body.expires_in).toBe(300);
      expect(issued.body.token_type).toBe('Bearer');
      expect(Object.hasOwn(issued.body, 'refresh_token')).toBe(false);
      const token = machineTokenValue(issued);
      expect(token.split('.').length === 3).toBe(false);
      const native = await f.provider.ClientCredentials.find(token);
      if (!native) throw new Error('Issued token did not resolve as native ClientCredentials');
      expect(native.kind).toBe('ClientCredentials');
      expect(native.clientId === f.lifecycle.client.clientId).toBe(true);
      expect(native.scopes.has('admin:user:invite')).toBe(true);
      if (typeof native.exp !== 'number') throw new Error('Native token has no persisted expiry');
      expect(native.exp - native.iat).toBe(300);
      const stored = await findServiceAccountByClientId(f.lifecycle.client.id);
      if (!stored) throw new Error('Fixture binding is missing');
      const metadata = native.extra?.['urn:porta:service-account'];
      if (!isRecord(metadata)) throw new Error('Issued token has no service-account metadata');
      expect(Object.keys(metadata).sort()).toEqual(['accountId', 'bindingId', 'version']);
      expect(metadata.accountId === stored.accountId).toBe(true);
      expect(metadata.bindingId === stored.id).toBe(true);
      expect(metadata.version === stored.authorizationVersion).toBe(true);
      for (const value of Object.values(metadata)) {
        expect(typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)).toBe(true);
      }
      expect(await f.provider.AccessToken.find(token) === undefined).toBe(true);
      const email = `issued-${randomUUID()}@example.test`;
      expect((await machineInvitationRequest(f, token, email)).status).toBe(201);
      expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
      expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
    },
  );

  it('should derive all privileged metadata from storage despite caller-supplied fields', async () => {
    const f = fixture = await createMachineHttpFixture();
    const forged = { accountId: randomUUID(), bindingId: randomUUID(), version: randomUUID() };
    const issued = await issueMachineToken(f, { fields: {
      'urn:porta:service-account': JSON.stringify(forged),
      extra: JSON.stringify({ 'urn:porta:service-account': forged }),
      accountId: forged.accountId, bindingId: forged.bindingId, version: forged.version,
    } });
    if (issued.status !== 200) {
      expect(issued.status >= 400 && issued.status < 500).toBe(true);
      expect(typeof issued.body.access_token === 'string').toBe(false);
      return;
    }
    const native = await f.provider.ClientCredentials.find(machineTokenValue(issued));
    const stored = await findServiceAccountByClientId(f.lifecycle.client.id);
    const metadata = native?.extra?.['urn:porta:service-account'];
    if (!stored || !isRecord(metadata)) throw new Error('Native authoritative metadata is missing');
    expect(metadata.accountId === stored.accountId).toBe(true);
    expect(metadata.bindingId === stored.id).toBe(true);
    expect(metadata.version === stored.authorizationVersion).toBe(true);
  });

  it('should enforce the persisted expiry at the native lookup and invitation boundary', async () => {
    const f = fixture = await createMachineHttpFixture();
    const issued = await issueMachineToken(f);
    expect(issued.status).toBe(200);
    const token = machineTokenValue(issued);
    const native = await f.provider.ClientCredentials.find(token);
    if (!native || typeof native.exp !== 'number') throw new Error('Native expiry is missing');
    expect(native.exp - native.iat).toBe(300);
    const email = `expired-${randomUUID()}@example.test`;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime((native.exp - 1) * 1000);
    expect(native.isValid).toBe(true);
    vi.setSystemTime((native.exp + 1) * 1000);
    expect(native.isExpired).toBe(true);
    expect(native.isValid).toBe(false);
    expect((await machineInvitationRequest(f, token, email)).status).toBe(401);
    expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
    expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
  });

  it.each([false, true])('should retain ordinary 600-second issuance with bound=%s and no feature scope', async (bound) => {
    const f = fixture = await createMachineHttpFixture({ bound });
    await updateClient(f.lifecycle.client.id, { scope: 'profile' }, f.lifecycle.actor.id);
    const issued = await issueMachineToken(f, { scope: 'profile' });
    expect(issued.status).toBe(200);
    expect(issued.body.expires_in).toBe(600);
    const token = machineTokenValue(issued);
    const native = await f.provider.ClientCredentials.find(token);
    if (!native || typeof native.exp !== 'number') throw new Error('Ordinary native token is missing');
    expect(native.exp - native.iat).toBe(600);
    expect(native.extra?.['urn:porta:service-account'] === undefined).toBe(true);
    expect(await f.provider.AccessToken.find(token) === undefined).toBe(true);
    const email = `ordinary-${randomUUID()}@example.test`;
    expect([401, 403]).toContain((await machineInvitationRequest(f, token, email)).status);
    expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
    expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
  });

  it('should preserve ordinary tenant HTTP issuance without granting Admin authority', async () => {
    const f = fixture = await createMachineHttpFixture({ bound: false });
    const tenant = await createTestClientWithSecret(f.lifecycle.organization.id, f.lifecycle.application.id, {
      grantTypes: ['client_credentials'], responseTypes: [], scope: 'profile',
    });
    const issued = await issueMachineToken(f, {
      clientId: tenant.client.clientId, secret: tenant.clientSecret,
      issuerSlug: f.lifecycle.organization.slug, scope: 'profile',
    });
    expect(issued.status).toBe(200);
    expect(issued.body.expires_in).toBe(600);
    const token = machineTokenValue(issued);
    const native = await f.provider.ClientCredentials.find(token);
    if (!native || typeof native.exp !== 'number') throw new Error('Ordinary tenant token is missing');
    expect(native.exp - native.iat).toBe(600);
    expect(native.extra?.['urn:porta:service-account'] === undefined).toBe(true);
    expect(await f.provider.AccessToken.find(token) === undefined).toBe(true);
    const email = `tenant-token-${randomUUID()}@example.test`;
    expect((await machineInvitationRequest(f, token, email)).status).toBe(401);
    expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
    expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
  });

  it('should retain explicit native resource lifetimes for ordinary ClientCredentials', async () => {
    const f = fixture = await createMachineHttpFixture({ bound: false });
    await updateClient(f.lifecycle.client.id, { scope: 'profile' }, f.lifecycle.actor.id);
    const issued = await issueMachineToken(f, { scope: 'profile' });
    expect(issued.status).toBe(200);
    const client = await f.provider.Client.find(f.lifecycle.client.clientId);
    if (!client) throw new Error('Ordinary native client is missing');
    const resourceServer = new f.provider.ResourceServer('https://resource.example.test', {
      scope: 'profile', accessTokenTTL: 47, accessTokenFormat: 'opaque',
    });
    const opaque = await new f.provider.ClientCredentials({ client, scope: 'profile', resourceServer }).save();
    const native = await f.provider.ClientCredentials.find(opaque);
    if (!native || typeof native.exp !== 'number') throw new Error('Resource token is missing');
    expect(native.exp - native.iat).toBe(47);
    expect(native.extra?.['urn:porta:service-account'] === undefined).toBe(true);
    expect(await f.provider.AccessToken.find(opaque) === undefined).toBe(true);
  });

  it('should keep genuine human AccessToken artifacts separate even for a bound client', async () => {
    const f = fixture = await createMachineHttpFixture();
    const client = await f.provider.Client.find(f.lifecycle.client.clientId);
    if (!client) throw new Error('Native client is missing');
    const grant = new f.provider.Grant({ clientId: client.clientId, accountId: f.lifecycle.actor.id });
    grant.addOIDCScope('admin:user:invite');
    const grantId = await grant.save();
    const token = await new f.provider.AccessToken({
      client, accountId: f.lifecycle.actor.id, grantId, gty: 'authorization_code', scope: 'admin:user:invite',
    }).save();
    const native = await f.provider.AccessToken.find(token);
    expect(native?.accountId === f.lifecycle.actor.id).toBe(true);
    expect(native?.extra?.['urn:porta:service-account'] === undefined).toBe(true);
    expect(await f.provider.ClientCredentials.find(token) === undefined).toBe(true);
  });
});
