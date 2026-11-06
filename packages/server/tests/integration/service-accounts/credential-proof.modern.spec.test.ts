/** A proven modern credential cannot inherit authority committed after its retirement. */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Secret } from '../../../src/clients/crypto.js';
import { updateClient } from '../../../src/clients/index.js';
import { generateAndStore, revoke } from '../../../src/clients/secret-service.js';
import {
  findServiceAccountByClientId, revokeServiceAccount, setServiceAccount,
} from '../../../src/service-accounts/index.js';
import {
  createCredentialProofBarrier, prepareCredentialProofSecrets, waitForCredentialProofStep,
} from './credential-proof-fixtures.js';
import type { CredentialProofBarrier } from './credential-proof-fixtures.js';
import { readLifecycleSecrets } from './lifecycle-fixtures.js';
import {
  createMachineHttpFixture, isRecord, issueMachineToken, machineInvitationRequest,
  machineTokenValue, readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineTokenResponse } from './machine-http-fixtures.js';

describe.each(['client_secret_basic', 'client_secret_post'] as const)('modern credential proof through %s', (method) => {
  it.each(['first binding', 'restoration', 'proven-secret retirement'] as const)(
    'should not gain a newer privileged generation after %s while validation is paused', async (operation) => {
      const f = await createMachineHttpFixture({ bound: operation !== 'first binding', method });
      let control: CredentialProofBarrier | undefined;
      let barrier: CredentialProofBarrier | undefined;
      let pending: Promise<MachineTokenResponse> | undefined;
      let mutation: Promise<void> | undefined;
      try {
        await updateClient(f.lifecycle.client.id, { scope: 'profile' }, f.lifecycle.actor.id);
        const secrets = await prepareCredentialProofSecrets(f, 'modern');
        expect(secrets.proven.id === secrets.canonical.id).toBe(false);

        // First qualify this exact HTTP assembly without a held proof. Otherwise a
        // broken handoff could look indistinguishable from correct credential retirement.
        control = await createCredentialProofBarrier(f);
        control.release();
        for (const credential of [secrets.canonical, secrets.proven]) {
          const ordinary = await issueMachineToken({ ...f, baseUrl: control.baseUrl }, {
            secret: credential.plaintext, scope: 'profile', method,
          });
          expect(ordinary.status).toBe(200);
          expect(ordinary.body.expires_in).toBe(600);
          const native = await f.provider.ClientCredentials.find(machineTokenValue(ordinary));
          expect(native !== undefined).toBe(true);
          expect(native?.extra?.['urn:porta:service-account'] === undefined).toBe(true);
        }
        await control.close();
        control = undefined;
        await updateClient(f.lifecycle.client.id, { scope: 'profile admin:user:invite' }, f.lifecycle.actor.id);
        const before = await findServiceAccountByClientId(f.lifecycle.client.id);
        if (f.binding) {
          const usable = await issueMachineToken(f, { secret: secrets.proven.plaintext, method });
          expect(usable.status).toBe(200);
          const email = `modern-proof-control-${randomUUID()}@example.test`;
          expect((await machineInvitationRequest(f, machineTokenValue(usable), email)).status).toBe(201);
          expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
          expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
        }
        if (operation === 'restoration') await revokeServiceAccount(f.lifecycle.client.id, f.lifecycle.actor);
        const earlierSecrets = await readLifecycleSecrets(f.lifecycle.client.id);
        barrier = await createCredentialProofBarrier(f);
        pending = issueMachineToken({ ...f, baseUrl: barrier.baseUrl }, { secret: secrets.proven.plaintext, method });
        await waitForCredentialProofStep(Promise.race([
          barrier.reached,
          pending.then(
            () => { throw new Error('Token request completed before the genuine proof pause'); },
            () => { throw new Error('Token request failed before the genuine proof pause'); },
          ),
        ]));

        let freshSecret: string | undefined;
        mutation = (async () => {
          if (operation === 'proven-secret retirement') {
            await revoke(f.lifecycle.client.id, secrets.proven.id, f.lifecycle.actor.id);
            freshSecret = secrets.canonical.plaintext;
          } else {
            await setServiceAccount(f.lifecycle.client.id, {
              accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target],
            }, f.lifecycle.actor);
            freshSecret = (await generateAndStore(f.lifecycle.client.id, {}, f.lifecycle.actor.id)).plaintext;
          }
        })();
        await waitForCredentialProofStep(mutation);
        const after = await findServiceAccountByClientId(f.lifecycle.client.id);
        if (!after || !freshSecret) throw new Error('Committed proof transition is missing');
        expect(after.status).toBe('active');
        expect(after.authorizationVersion === before?.authorizationVersion).toBe(false);
        if (before) expect(after.accountId === before.accountId).toBe(true);
        const currentSecrets = await readLifecycleSecrets(f.lifecycle.client.id);
        expect(currentSecrets.some((entry) => entry.id === secrets.proven.id && entry.status === 'active')).toBe(false);
        if (operation === 'proven-secret retirement') {
          expect(currentSecrets.some((entry) => entry.id === secrets.canonical.id && entry.status === 'active')).toBe(true);
          const client = await f.provider.Client.find(f.lifecycle.client.clientId);
          expect(client?.clientSecret === sha256Secret(secrets.canonical.plaintext)).toBe(true);
        } else {
          for (const previous of earlierSecrets.filter((entry) => entry.status === 'active')) {
            expect(currentSecrets.some((entry) => entry.id === previous.id && entry.status === 'active')).toBe(false);
          }
        }

        // Releasing only after the awaited commit fixes the interleaving being tested.
        barrier.release();
        const delayed = await waitForCredentialProofStep(pending);
        if (delayed.status === 200) {
          const token = machineTokenValue(delayed);
          const native = await f.provider.ClientCredentials.find(token);
          expect(native !== undefined).toBe(true);
          const metadata = native?.extra?.['urn:porta:service-account'];
          expect(isRecord(metadata) && metadata.version === after.authorizationVersion).toBe(false);
          const email = `modern-proof-denied-${randomUUID()}@example.test`;
          expect([401, 403]).toContain((await machineInvitationRequest(f, token, email)).status);
          expect(await readMachineInvitation(f.lifecycle.organization.id, email)).toBeNull();
          expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
        } else {
          expect(delayed.status >= 400 && delayed.status < 500).toBe(true);
          expect(typeof delayed.body.access_token === 'string').toBe(false);
        }
        const fresh = await issueMachineToken(f, { secret: freshSecret, method });
        expect(fresh.status).toBe(200);
        expect(fresh.body.expires_in).toBe(300);
        const token = machineTokenValue(fresh);
        const native = await f.provider.ClientCredentials.find(token);
        const metadata = native?.extra?.['urn:porta:service-account'];
        expect(isRecord(metadata) && metadata.version === after.authorizationVersion).toBe(true);
        const email = `modern-proof-fresh-${randomUUID()}@example.test`;
        expect((await machineInvitationRequest(f, token, email)).status).toBe(201);
        expect((await readMachineInvitation(f.lifecycle.organization.id, email)) !== null).toBe(true);
        expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
      } finally {
        barrier?.release();
        control?.release();
        const work: Promise<unknown>[] = [];
        if (pending) work.push(pending);
        if (mutation) work.push(mutation);
        await Promise.allSettled(work);
        try { await barrier?.close(); }
        finally {
          try { await control?.close(); }
          finally { await f.close(); }
        }
      }
    }, 60_000,
  );
});
