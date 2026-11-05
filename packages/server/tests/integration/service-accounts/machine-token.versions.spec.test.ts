/** Formerly usable machine tokens obey live policy generations and coarse secret revocation. */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { generateAndStore, revoke } from '../../../src/clients/secret-service.js';
import {
  findServiceAccountByClientId, revokeServiceAccount, setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { readLifecycleSecrets } from './lifecycle-fixtures.js';
import {
  createMachineHttpFixture, isRecord, issueMachineToken, machineInvitationRequest,
  machineTokenValue, readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';

let fixture: MachineHttpFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

/** A usable-token control requires committed invitation state and no eager user. */
async function successfulInvitation(f: MachineHttpFixture, token: string): Promise<void> {
  const email = `generation-control-${randomUUID()}@example.test`;
  expect((await machineInvitationRequest(f, token, email)).status).toBe(201);
  expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
  expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
}

/** Deny the old artifact without confusing native reference invalidation with live authorization failure. */
async function deniedInvitation(f: MachineHttpFixture, token: string): Promise<void> {
  const native = await f.provider.ClientCredentials.find(token);
  const email = `generation-denied-${randomUUID()}@example.test`;
  expect((await machineInvitationRequest(f, token, email)).status).toBe(native ? 403 : 401);
  expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
  expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
}

describe('usable-token generation changes', () => {
  it.each(['policy replacement', 'revocation', 'restoration'] as const)(
    'should invalidate an actually usable token after %s', async (operation) => {
      const f = fixture = await createMachineHttpFixture();
      if (!f.binding) throw new Error('Fixture binding is missing');
      if (operation === 'restoration') await generateAndStore(f.lifecycle.client.id, {}, f.lifecycle.actor.id);
      const before = await findServiceAccountByClientId(f.lifecycle.client.id);
      if (!before) throw new Error('Stored binding is missing');
      const beforeSecrets = await readLifecycleSecrets(f.lifecycle.client.id);
      const issued = await issueMachineToken(f);
      expect(issued.status).toBe(200);
      const oldToken = machineTokenValue(issued);
      await successfulInvitation(f, oldToken);
      if (operation === 'policy replacement') {
        await setServiceAccount(f.lifecycle.client.id, { targets: [f.lifecycle.target] }, f.lifecycle.actor);
      } else {
        await revokeServiceAccount(f.lifecycle.client.id, f.lifecycle.actor);
        const revoked = await findServiceAccountByClientId(f.lifecycle.client.id);
        expect(revoked?.authorizationVersion === before.authorizationVersion).toBe(false);
        if (operation === 'restoration') {
          await setServiceAccount(f.lifecycle.client.id, { targets: [f.lifecycle.target] }, f.lifecycle.actor);
        }
      }
      const changed = await findServiceAccountByClientId(f.lifecycle.client.id);
      if (!changed) throw new Error('Changed binding is missing');
      expect(changed.authorizationVersion === before.authorizationVersion).toBe(false);
      expect(changed.accountId === before.accountId).toBe(true);
      await deniedInvitation(f, oldToken);

      let secret = f.credential.plaintext;
      if (operation !== 'policy replacement') {
        if (operation === 'revocation') {
          await setServiceAccount(f.lifecycle.client.id, { targets: [f.lifecycle.target] }, f.lifecycle.actor);
        }
        const retired = await readLifecycleSecrets(f.lifecycle.client.id);
        for (const previous of beforeSecrets.filter((entry) => entry.status === 'active')) {
          expect(retired.some((entry) => entry.id === previous.id && entry.status === 'active')).toBe(false);
        }
        const originalSecretIds = new Set(beforeSecrets.map((entry) => entry.id));
        expect(retired.every((entry) => originalSecretIds.has(entry.id))).toBe(true);
        const rejected = await issueMachineToken(f, { secret });
        expect(rejected.status >= 400 && rejected.status < 500).toBe(true);
        expect(typeof rejected.body.access_token === 'string').toBe(false);
        secret = (await generateAndStore(f.lifecycle.client.id, {}, f.lifecycle.actor.id)).plaintext;
      }
      const fresh = await issueMachineToken(f, { secret });
      expect(fresh.status).toBe(200);
      await successfulInvitation(f, machineTokenValue(fresh));
      await deniedInvitation(f, oldToken);
    },
  );

  it('should preserve usable tokens on overlap but invalidate all older versions on explicit secret revocation', async () => {
    const f = fixture = await createMachineHttpFixture();
    const first = await issueMachineToken(f);
    expect(first.status).toBe(200);
    const tokenA = machineTokenValue(first);
    await successfulInvitation(f, tokenA);
    const before = await findServiceAccountByClientId(f.lifecycle.client.id);
    if (!before) throw new Error('Stored binding is missing');

    const overlap = await generateAndStore(f.lifecycle.client.id, {}, f.lifecycle.actor.id);
    const afterGeneration = await findServiceAccountByClientId(f.lifecycle.client.id);
    expect(afterGeneration?.authorizationVersion === before.authorizationVersion).toBe(true);
    await successfulInvitation(f, tokenA);
    const second = await issueMachineToken(f, { secret: overlap.plaintext });
    expect(second.status).toBe(200);
    const tokenB = machineTokenValue(second);
    await successfulInvitation(f, tokenB);

    await revoke(f.lifecycle.client.id, overlap.id, f.lifecycle.actor.id);
    const afterRevocation = await findServiceAccountByClientId(f.lifecycle.client.id);
    if (!afterRevocation) throw new Error('Revoked generation is missing');
    expect(afterRevocation.authorizationVersion === before.authorizationVersion).toBe(false);
    for (const token of [tokenA, tokenB]) {
      expect(await f.provider.ClientCredentials.find(token) !== undefined).toBe(true);
      await deniedInvitation(f, token);
    }
    const fresh = await issueMachineToken(f, { secret: f.credential.plaintext });
    expect(fresh.status).toBe(200);
    const freshToken = machineTokenValue(fresh);
    const native = await f.provider.ClientCredentials.find(freshToken);
    const metadata = native?.extra?.['urn:porta:service-account'];
    if (!isRecord(metadata)) throw new Error('Fresh token metadata is missing');
    expect(metadata.version === afterRevocation.authorizationVersion).toBe(true);
    await successfulInvitation(f, freshToken);
  });
});
