/** Real credential proofs with a future stored expiry retain invitation authority. */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { updateClient } from '../../../src/clients/index.js';
import { getPool } from '../../../src/lib/database.js';
import { prepareCredentialProofSecrets } from './credential-proof-fixtures.js';
import type { CredentialProofSecrets } from './credential-proof-fixtures.js';
import {
  createMachineHttpFixture, isRecord, issueMachineToken, machineInvitationRequest,
  machineTokenValue, readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';

/** UUID checks report only booleans, never token metadata values. */
const UUID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

/** Safe database observations of the presented and canonical credentials. */
interface FutureProofState {
  /** The presented row remains active and owned by the actual client. */
  provenOwnedActive: boolean;
  /** Its expiry is non-null and strictly in the database's future. */
  provenFuture: boolean;
  /** The distinct canonical credential remains active, owned and unexpired. */
  canonicalUsable: boolean;
}

/** Read real lifecycle and expiry state without selecting any credential material. */
async function readFutureProofState(
  fixture: MachineHttpFixture,
  secrets: CredentialProofSecrets,
): Promise<FutureProofState> {
  const result = await getPool().query<FutureProofState>(
    `SELECT (proven.client_id = $1::uuid AND proven.status = 'active') AS "provenOwnedActive",
       (proven.expires_at IS NOT NULL AND proven.expires_at > clock_timestamp()) AS "provenFuture",
       (canonical.client_id = $1::uuid AND canonical.status = 'active'
         AND (canonical.expires_at IS NULL OR canonical.expires_at > clock_timestamp())) AS "canonicalUsable"
     FROM client_secrets AS proven
     JOIN client_secrets AS canonical ON canonical.id = $3::uuid
     WHERE proven.id = $2::uuid`,
    [fixture.lifecycle.client.id, secrets.proven.id, secrets.canonical.id],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Owned future-expiring proof credentials are missing');
  return row;
}

describe.each(['modern', 'legacy'] as const)('future-expiring %s credential proof', (kind) => {
  it.each(['client_secret_basic', 'client_secret_post'] as const)(
    'should issue usable native invitation authority through %s before its stored expiry', async (method) => {
      const f = await createMachineHttpFixture({ method });
      try {
        await updateClient(f.lifecycle.client.id, { scope: 'profile admin:user:invite' }, f.lifecycle.actor.id);
        const secrets = await prepareCredentialProofSecrets(f, kind);
        expect(secrets.proven.id === secrets.canonical.id).toBe(false);
        const updated = await getPool().query(
          `UPDATE client_secrets SET expires_at = clock_timestamp() + interval '2 minutes'
           WHERE id = $1 AND client_id = $2 AND status = 'active'`,
          [secrets.proven.id, f.lifecycle.client.id],
        );
        expect(updated.rowCount).toBe(1);
        expect(await readFutureProofState(f, secrets)).toEqual({
          provenOwnedActive: true, provenFuture: true, canonicalUsable: true,
        });

        // A separate real canonical credential must still authenticate; the
        // presented credential below must succeed on its own future-expiry proof.
        const canonical = await issueMachineToken(f, { secret: secrets.canonical.plaintext, method });
        expect(canonical.status).toBe(200);
        expect(canonical.body.expires_in).toBe(300);
        expect(await f.provider.ClientCredentials.find(machineTokenValue(canonical)) !== undefined).toBe(true);

        const issued = await issueMachineToken(f, { secret: secrets.proven.plaintext, method });
        expect(issued.status).toBe(200);
        expect(issued.body.expires_in).toBe(300);
        const token = machineTokenValue(issued);
        const native = await f.provider.ClientCredentials.find(token);
        if (!native || typeof native.exp !== 'number') throw new Error('Future-expiring proof has no native token');
        expect(native.kind).toBe('ClientCredentials');
        expect(native.exp - native.iat).toBe(300);
        expect(native.clientId === f.lifecycle.client.clientId).toBe(true);
        expect(native.scopes.has('admin:user:invite')).toBe(true);
        const identity = native.extra?.['urn:porta:service-account'];
        if (!f.binding || !isRecord(identity)) throw new Error('Future-expiring proof has no bound native identity');
        expect(Object.keys(identity).sort()).toEqual(['accountId', 'bindingId', 'version']);
        expect(identity.accountId === f.binding.serviceAccountId).toBe(true);
        expect(identity.bindingId === f.binding.id).toBe(true);
        for (const value of Object.values(identity)) {
          expect(typeof value === 'string' && UUID_PATTERN.test(value)).toBe(true);
        }

        const email = `future-proof-${randomUUID()}@example.test`;
        expect((await machineInvitationRequest(f, token, email)).status).toBe(201);
        const invitation = await readMachineInvitation(f.lifecycle.organization.id, email);
        if (!invitation) throw new Error('Future-expiring proof did not persist an invitation');
        expect(UUID_PATTERN.test(invitation.id)).toBe(true);
        expect(await readMachineUserCount(f.lifecycle.organization.id, email)).toBe(0);
        expect(await readFutureProofState(f, secrets)).toEqual({
          provenOwnedActive: true, provenFuture: true, canonicalUsable: true,
        });
      } finally {
        await f.close();
      }
    }, 60_000,
  );
});
