/** A credential that naturally expires during the parent-lock wait cannot issue machine authority. */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { updateClient } from '../../../src/clients/index.js';
import { getPool } from '../../../src/lib/database.js';
import { getServiceAccount } from '../../../src/service-accounts/index.js';
import {
  createCredentialProofBarrier, prepareCredentialProofSecrets, waitForCredentialProofStep,
} from './credential-proof-fixtures.js';
import type { CredentialProofBarrier } from './credential-proof-fixtures.js';
import { holdLifecycleWork, waitForLifecycleParentBlock } from './lifecycle-concurrency-fixtures.js';
import {
  createMachineHttpFixture, isRecord, issueMachineToken, machineInvitationRequest,
  machineTokenValue, readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineTokenResponse } from './machine-http-fixtures.js';

/** Safe observations of one blocked issuance and its two owned credential rows. */
interface ExpiryWindow {
  /** Backend issuing the token, fixed across the before/after expiry observations. */
  pid: number;
  /** Its real transaction began while the presented credential was still unexpired. */
  beganBeforeExpiry: boolean;
  /** PostgreSQL wall time has reached the presented credential's scheduled expiry. */
  expired: boolean;
  /** The presented row still belongs to the client and has not been revoked. */
  provenOwnedActive: boolean;
  /** The separate canonical row remains active, owned and unexpired. */
  canonicalUsable: boolean;
}

/**
 * Observe only a backend actually blocked by the owned transaction. Returning no
 * row means the required lock interleaving is absent, not that expiry was proved.
 * No secret, digest, request text or production clock expression is inspected.
 */
async function readExpiryWindow(
  clientId: string,
  provenId: string,
  canonicalId: string,
  holderPid: number,
  waiterPid?: number,
): Promise<ExpiryWindow | null> {
  const result = await getPool().query<ExpiryWindow>(
    `SELECT waiting.pid,
       (waiting.xact_start < proven.expires_at) IS TRUE AS "beganBeforeExpiry",
       (clock_timestamp() >= proven.expires_at) IS TRUE AS expired,
       (proven.client_id = $1::uuid AND proven.status = 'active') AS "provenOwnedActive",
       (canonical.client_id = $1::uuid AND canonical.status = 'active'
         AND (canonical.expires_at IS NULL OR canonical.expires_at > clock_timestamp())) AS "canonicalUsable"
     FROM pg_stat_activity AS waiting
     JOIN client_secrets AS proven ON proven.id = $2::uuid
     JOIN client_secrets AS canonical ON canonical.id = $3::uuid
     WHERE waiting.datname = current_database() AND waiting.wait_event_type = 'Lock'
       AND $4::integer = ANY(pg_blocking_pids(waiting.pid))
       AND ($5::integer IS NULL OR waiting.pid = $5::integer)`,
    [clientId, provenId, canonicalId, holderPid, waiterPid ?? null],
  );
  if (result.rows.length > 1) throw new Error('Expected one native issuance waiter on the owned client');
  return result.rows[0] ?? null;
}

describe.each(['modern', 'legacy'] as const)('natural expiry of %s credential proof', (kind) => {
  it.each(['client_secret_basic', 'client_secret_post'] as const)(
    'should deny newer issuance after expiry during a real parent-lock wait through %s', async (method) => {
      const f = await createMachineHttpFixture({ method });
      let control: CredentialProofBarrier | undefined;
      let barrier: CredentialProofBarrier | undefined;
      let held: ReturnType<typeof holdLifecycleWork> | undefined;
      let pending: Promise<MachineTokenResponse> | undefined;
      let expiryWrite: Promise<{ rowCount: number | null; rows: { unexpired: boolean }[] }> | undefined;
      try {
        await updateClient(f.lifecycle.client.id, { scope: 'profile admin:user:invite' }, f.lifecycle.actor.id);
        const secrets = await prepareCredentialProofSecrets(f, kind);
        expect(secrets.proven.id === secrets.canonical.id).toBe(false);

        // Qualify both real authentication paths through the same bridge assembly
        // before any transaction is held. A broken canonical handoff is not expiry evidence.
        control = await createCredentialProofBarrier(f);
        control.release();
        for (const credential of [secrets.canonical, secrets.proven]) {
          const ordinary = await issueMachineToken({ ...f, baseUrl: control.baseUrl }, {
            secret: credential.plaintext, method, scope: 'profile',
          });
          expect(ordinary.status).toBe(200);
          expect(ordinary.body.expires_in).toBe(600);
          const native = await f.provider.ClientCredentials.find(machineTokenValue(ordinary));
          expect(native !== undefined).toBe(true);
          expect(native?.extra?.['urn:porta:service-account'] === undefined).toBe(true);
        }
        await control.close();
        control = undefined;
        const usable = await issueMachineToken(f, { secret: secrets.proven.plaintext, method });
        expect(usable.status).toBe(200);
        expect(usable.body.expires_in).toBe(300);
        const controlEmail = `expiry-control-${randomUUID()}@example.test`;
        expect((await machineInvitationRequest(f, machineTokenValue(usable), controlEmail)).status).toBe(201);
        expect((await readMachineInvitation(f.lifecycle.organization.id, controlEmail)) !== null).toBe(true);
        expect(await readMachineUserCount(f.lifecycle.organization.id, controlEmail)).toBe(0);

        barrier = await createCredentialProofBarrier(f);
        pending = issueMachineToken({ ...f, baseUrl: barrier.baseUrl }, {
          secret: secrets.proven.plaintext, method, scope: 'admin:user:invite',
        });
        // Observe rejection immediately, but retain the original promise for assertions and cleanup.
        void pending.catch(() => undefined);
        await waitForCredentialProofStep(Promise.race([
          barrier.reached,
          pending.then(
            () => { throw new Error('Token request completed before the genuine proof pause'); },
            () => { throw new Error('Token request failed before the genuine proof pause'); },
          ),
        ]));
        held = holdLifecycleWork(() => getServiceAccount(f.lifecycle.client.id, f.lifecycle.actor));
        const owner = await waitForCredentialProofStep(held.ready);
        expiryWrite = getPool().query<{ unexpired: boolean }>(
          `UPDATE client_secrets SET expires_at = clock_timestamp() + interval '3 seconds'
           WHERE id = $1 AND client_id = $2 AND status = 'active'
             AND (expires_at IS NULL OR expires_at > clock_timestamp())
           RETURNING expires_at > clock_timestamp() AS unexpired`,
          [secrets.proven.id, f.lifecycle.client.id],
        );
        const armed = await waitForCredentialProofStep(expiryWrite);
        expect(armed.rowCount).toBe(1);
        expect(armed.rows[0]?.unexpired).toBe(true);
        barrier.release();
        await waitForLifecycleParentBlock(owner.pid);
        const before = await readExpiryWindow(
          f.lifecycle.client.id, secrets.proven.id, secrets.canonical.id, owner.pid,
        );
        if (!before) throw new Error('Native issuance did not remain at its parent-lock barrier');
        expect(before.beganBeforeExpiry).toBe(true);
        expect(before.expired).toBe(false);
        expect(before.provenOwnedActive).toBe(true);
        expect(before.canonicalUsable).toBe(true);

        // Only database observations establish expiry and continued blocking.
        // The Node deadline bounds failure; waiting a duration is never a success condition.
        const deadline = Date.now() + 10_000;
        let expired: ExpiryWindow | undefined;
        while (Date.now() < deadline) {
          const observation = await readExpiryWindow(
            f.lifecycle.client.id, secrets.proven.id, secrets.canonical.id, owner.pid, before.pid,
          );
          if (!observation) throw new Error('Native issuance left its parent-lock barrier before expiry was witnessed');
          expect(observation.beganBeforeExpiry).toBe(true);
          expect(observation.provenOwnedActive).toBe(true);
          expect(observation.canonicalUsable).toBe(true);
          if (observation.expired) {
            expired = observation;
            break;
          }
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        if (!expired) throw new Error('Natural credential expiry was not witnessed while issuance remained blocked');
        expect(expired.expired).toBe(true);
        held.release();
        await waitForCredentialProofStep(held.result);
        const delayed = await waitForCredentialProofStep(pending);

        // Observe the surviving canonical path after expiry before asserting the
        // negative outcome, so a failure still has an actual post-expiry positive control.
        const fresh = await issueMachineToken(f, { secret: secrets.canonical.plaintext, method });
        expect(fresh.status).toBe(200);
        expect(fresh.body.expires_in).toBe(300);
        const freshToken = machineTokenValue(fresh);
        const native = await f.provider.ClientCredentials.find(freshToken);
        if (!native || typeof native.exp !== 'number') throw new Error('Fresh canonical native token is missing');
        expect(native.exp - native.iat).toBe(300);
        expect(isRecord(native.extra?.['urn:porta:service-account'])).toBe(true);
        const freshEmail = `expiry-fresh-${randomUUID()}@example.test`;
        expect((await machineInvitationRequest(f, freshToken, freshEmail)).status).toBe(201);
        expect((await readMachineInvitation(f.lifecycle.organization.id, freshEmail)) !== null).toBe(true);
        expect(await readMachineUserCount(f.lifecycle.organization.id, freshEmail)).toBe(0);

        const deniedEmail = `expiry-denied-${randomUUID()}@example.test`;
        if (delayed.status === 200) {
          const token = machineTokenValue(delayed);
          const delayedNative = await f.provider.ClientCredentials.find(token);
          expect(delayedNative !== undefined).toBe(true);
          expect(delayedNative?.extra?.['urn:porta:service-account'] === undefined).toBe(true);
          expect([401, 403]).toContain((await machineInvitationRequest(f, token, deniedEmail)).status);
        } else {
          expect(delayed.status >= 400 && delayed.status < 500).toBe(true);
          expect(typeof delayed.body.access_token === 'string').toBe(false);
        }
        expect(await readMachineInvitation(f.lifecycle.organization.id, deniedEmail)).toBeNull();
        expect(await readMachineUserCount(f.lifecycle.organization.id, deniedEmail)).toBe(0);
      } finally {
        barrier?.release();
        held?.release();
        control?.release();
        const outstanding: Promise<unknown>[] = [];
        if (pending) outstanding.push(pending);
        if (held) outstanding.push(held.result);
        if (expiryWrite) outstanding.push(expiryWrite);
        await Promise.allSettled(outstanding);
        try { await barrier?.close(); }
        finally {
          try { await control?.close(); }
          finally { await f.close(); }
        }
      }
    }, 60_000,
  );
});
