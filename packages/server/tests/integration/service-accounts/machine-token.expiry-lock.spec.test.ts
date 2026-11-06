import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { buildServiceAccountInvitationRateLimitKey } from '../../../src/service-accounts/index.js';
import {
  createMachineHttpFixture,
  isRecord,
  issueMachineToken,
  machineInvitationRequest,
  machineTokenValue,
  readMachineInvitation,
  readMachineUserCount,
} from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';
import { expectMachineInvitationCreated, readInvitationAudits } from './machine-invitation-fixtures.js';
import {
  holdExpiryParent,
  startExpiryUpload,
  waitForExpiryParent,
  waitForExpiryQueuedHandoff,
  waitForExpiryUploadCommit,
  withinExpiryDeadline,
} from './machine-token-expiry-lock-fixtures.js';
import type { ExpiryParentHold, ExpiryPartialUpload } from './machine-token-expiry-lock-fixtures.js';

/** Genuine native model instance whose public expiry state is evaluated against Date. */
type NativeMachineToken = Record<string, unknown>;

/** Accept only a real provider model object; `unknown` keeps provider typings out of this test. */
function requireNativeModel(value: unknown): NativeMachineToken {
  if (!isRecord(value)) throw new Error('The native token model is unavailable');
  return value;
}

/** Read one numeric model property through a runtime check instead of trusting its declared type. */
function nativeNumber(model: NativeMachineToken, property: string): number {
  const value = model[property];
  if (typeof value !== 'number') throw new Error('The native token model has no numeric witness');
  return value;
}

/** Read one boolean accessor through a runtime check so it stays live when Date advances. */
function nativeBoolean(model: NativeMachineToken, property: string): boolean {
  const value = model[property];
  if (typeof value !== 'boolean') throw new Error('The native token model has no boolean witness');
  return value;
}

describe.sequential('native machine expiry at locked invitation admission', () => {
  let fixture: MachineHttpFixture | undefined;
  let observer: PoolClient | undefined;
  let upload: ExpiryPartialUpload | undefined;
  let native: NativeMachineToken | undefined;
  let holders: ExpiryParentHold[] = [];
  let token = '';
  let expiry = 0;
  let email = '';
  let controlEmail = '';
  let controlId = '';
  let counterKey = '';
  let counterBefore: string | null = null;
  let mailBefore = 0;
  let auditIds = new Set<string>();

  /** Refuse stage construction when the real full-application setup did not complete. */
  function currentFixture(): MachineHttpFixture {
    if (!fixture) throw new Error('Expiry fixture is not ready');
    return fixture;
  }

  /** Keep observation on a reserved connection, separate from every application transaction. */
  function currentObserver(): PoolClient {
    if (!observer) throw new Error('The independent expiry observer is not ready');
    return observer;
  }

  /** Register each actual held transaction before its first asynchronous readiness wait. */
  function holdParent(): ExpiryParentHold {
    const held = holdExpiryParent(currentFixture());
    holders.push(held);
    return held;
  }

  /** Confirm genuine native authority is still usable at the observed database boundary. */
  function expectUsableNative(): NativeMachineToken {
    if (!native) throw new Error('The native expiry witness is missing');
    expect(nativeBoolean(native, 'isExpired')).toBe(false);
    expect(nativeBoolean(native, 'isValid')).toBe(true);
    expect(Math.floor(Date.now() / 1000) < expiry).toBe(true);
    return native;
  }

  /** Advance only Date after observing the lock wait; real I/O and deadlines keep running. */
  function advanceToNativeExpiry(offsetSeconds: 0 | 1): void {
    const model = expectUsableNative();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime((expiry + offsetSeconds) * 1000);
    expect(Date.now()).toBe((expiry + offsetSeconds) * 1000);
    expect(expiry > Math.floor(Date.now() / 1000)).toBe(false);
    expect(nativeBoolean(model, 'isExpired')).toBe(true);
  }

  /**
   * Finish the upload only after initial authentication has committed without retaining its lock.
   * The returned waiter is the later fresh authentication blocked behind a different real holder.
   */
  async function reachPostUploadAuthentication() {
    const initialHolder = holdParent();
    const initialReady = await withinExpiryDeadline(initialHolder.ready);
    upload = startExpiryUpload(currentFixture(), token, email);
    const initialAuth = await waitForExpiryParent(currentObserver(), initialReady.pid);
    initialHolder.release();
    await withinExpiryDeadline(initialHolder.result);
    await waitForExpiryUploadCommit(currentObserver(), initialAuth.pid);
    const postUploadHolder = holdParent();
    const postUploadReady = await withinExpiryDeadline(postUploadHolder.ready);
    upload.request.end(upload.remainder);
    const authentication = await waitForExpiryParent(currentObserver(), postUploadReady.pid);
    expectUsableNative();
    return { holder: postUploadHolder, holderPid: postUploadReady.pid, authentication };
  }

  /** Rejection cannot consume another budget slot or change any committed invitation effects. */
  async function expectNoExpiryEffects(): Promise<void> {
    const f = currentFixture();
    const organizationId = f.lifecycle.organization.id;
    expect((await readMachineInvitation(organizationId, email)) === null).toBe(true);
    expect(await readMachineUserCount(organizationId, email)).toBe(0);
    expect((await readInvitationAudits()).filter((row) => !auditIds.has(row.id)).length).toBe(0);
    expect(f.mail.attempts).toBe(mailBefore);
    expect(await getRedis().get(counterKey)).toBe(counterBefore);
    expect((await readMachineInvitation(organizationId, controlEmail))?.id === controlId).toBe(true);
    expect(await readMachineUserCount(organizationId, controlEmail)).toBe(0);
  }

  beforeEach(async () => {
    holders = [];
    fixture = await createMachineHttpFixture();
    const issued = await issueMachineToken(fixture);
    expect(issued.status).toBe(200);
    token = machineTokenValue(issued);
    native = requireNativeModel(await fixture.provider.ClientCredentials.find(token));
    const issuedAt = nativeNumber(native, 'iat');
    const expiresAt = nativeNumber(native, 'exp');
    expiry = expiresAt;
    expect(expiry - issuedAt).toBe(300);
    expect(nativeBoolean(native, 'isExpired')).toBe(false);
    controlEmail = `expiry-control-${randomUUID()}@test.example`;
    const control = await expectMachineInvitationCreated({ fixture },
      await machineInvitationRequest(fixture, token, controlEmail), controlEmail);
    controlId = control.id;
    const audits = await readInvitationAudits();
    expect(audits.map((row) => row.eventType).sort()).toEqual(['admin.mutation.committed', 'user.invited']);
    auditIds = new Set(audits.map((row) => row.id));
    mailBefore = fixture.mail.attempts;
    expect(mailBefore > 0).toBe(true);
    counterKey = buildServiceAccountInvitationRateLimitKey(fixture.lifecycle.client.id);
    counterBefore = await getRedis().get(counterKey);
    expect(counterBefore).toBe('1');
    email = `expiry-rejected-${randomUUID()}@test.example`;
    observer = await getPool().connect();
  });

  afterEach(async () => {
    vi.useRealTimers();
    const ownedUpload = upload;
    upload = undefined;
    ownedUpload?.request.destroy();
    for (const held of holders) held.release();
    const pending: Promise<unknown>[] = holders.flatMap((held) => [held.ready, held.result]);
    if (ownedUpload) pending.push(ownedUpload.result);
    try {
      await Promise.allSettled(pending);
    } finally {
      holders = [];
      native = undefined;
      token = '';
      try {
        const ownedObserver = observer;
        observer = undefined;
        ownedObserver?.release();
      } finally {
        const ownedFixture = fixture;
        fixture = undefined;
        await ownedFixture?.close();
      }
    }
  });

  it('should deny at exact native expiry after post-upload authentication waits for the parent lock', async () => {
    const { holder } = await reachPostUploadAuthentication();
    // A valid lookup cannot authorize admission once the conflicting lock wait reaches native expiry.
    advanceToNativeExpiry(0);
    holder.release();
    await withinExpiryDeadline(holder.result);
    if (!upload) throw new Error('The expiry upload is missing');
    expect(await withinExpiryDeadline(upload.result)).toBe(401);
    await expectNoExpiryEffects();
  });

  it('should deny after native expiry at a later dispatch lock wait following fresh authentication', async () => {
    const { holder, holderPid, authentication } = await reachPostUploadAuthentication();
    const dispatchHolder = holdParent();
    const queued = await waitForExpiryQueuedHandoff(currentObserver(), holderPid, authentication.pid);
    expect(queued.pid === authentication.pid).toBe(false);
    holder.release();
    await withinExpiryDeadline(holder.result);
    const dispatchReady = await withinExpiryDeadline(dispatchHolder.ready);
    expect(dispatchReady.pid).toBe(queued.pid);
    // Queued handoff proves authentication ended; the reused backend need not stay idle at COMMIT.
    const dispatch = await waitForExpiryParent(currentObserver(), dispatchReady.pid);
    expect(dispatch.blockers.includes(dispatchReady.pid)).toBe(true);
    // Fresh authentication cannot extend native identity lifetime past locked admission.
    advanceToNativeExpiry(1);
    dispatchHolder.release();
    await withinExpiryDeadline(dispatchHolder.result);
    if (!upload) throw new Error('The expiry upload is missing');
    expect(await withinExpiryDeadline(upload.result)).toBe(401);
    await expectNoExpiryEffects();
  });
});
