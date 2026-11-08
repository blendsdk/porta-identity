import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import * as serviceAccounts from '../../../src/service-accounts/index.js';
import { machineRequest } from './machine-http-fixtures.js';
import type { MachineHttpResponse } from './machine-http-fixtures.js';
import {
  createInvitationSession,
  expectMachineInvitationAbsent,
  expectMachineInvitationCreated,
  expectSafeMachineFailure,
  issueInvitationToken,
  postMachineInvitation,
} from './machine-invitation-fixtures.js';
import type { MachineInvitationSession } from './machine-invitation-fixtures.js';

describe.sequential('machine invitation strict client-wide counters', () => {
  let session: MachineInvitationSession | undefined;

  /** Do not perform backend work if the owned session was not created. */
  function currentSession(): MachineInvitationSession {
    if (!session) throw new Error('Machine invitation session is not ready');
    return session;
  }

  /** Resolve only the declared public key builder, without guessing a private Redis key. */
  function counterKey(clientId: string): string {
    const builder: unknown = Reflect.get(serviceAccounts, 'buildServiceAccountInvitationRateLimitKey');
    if (typeof builder !== 'function') throw new Error('The invitation counter key builder is unavailable');
    const key: unknown = builder(clientId);
    if (typeof key !== 'string' || key.length === 0) throw new Error('The invitation counter key is invalid');
    return key;
  }

  /** Exhaustion must retain a positive HTTP retry interval, not silently admit the request. */
  function expectExhausted(owned: MachineInvitationSession, response: MachineHttpResponse): void {
    expectSafeMachineFailure(owned, response, 429);
    const value = response.headers.get('retry-after');
    expect(value !== null && /^\d+$/.test(value) && Number(value) > 0).toBe(true);
  }

  beforeEach(async () => { session = await createInvitationSession(); });
  afterEach(async () => {
    const owned = session;
    session = undefined;
    await owned?.fixture.close();
  });

  it('should share thirty invitations across targets, request variants, tokens and policy versions', async () => {
    const owned = currentSession();
    const { fixture } = owned;
    const organizations = [fixture.lifecycle.organization.id, fixture.lifecycle.otherOrganization.id];
    for (let index = 0; index < 30; index += 1) {
      const organizationId = index % 2 === 0 ? organizations[0] : organizations[1];
      if (!organizationId) throw new Error('A permitted organization is missing');
      const email = `budget-${index}-${randomUUID()}@test.example`;
      const response = await machineRequest(fixture, {
        method: 'POST',
        path: `/api/admin/organizations/${organizationId}/users/invite?source=budget-${index}`,
        token: owned.token, body: { email, givenName: `Automation ${index}` },
        headers: { 'X-Request-Id': randomUUID(), 'User-Agent': `invitation-budget-${index}` },
      });
      await expectMachineInvitationCreated(owned, response, email, 'sent', organizationId);
    }
    const sent = fixture.mail.attempts;
    for (const organizationId of organizations) {
      const email = `exhausted-${randomUUID()}@test.example`;
      const response = await machineRequest(fixture, {
        method: 'POST', path: `/api/admin/organizations/${organizationId}/users/invite?request=another`,
        token: owned.token, body: { email, familyName: 'Another request' },
        headers: { 'X-Request-Id': randomUUID(), 'User-Agent': 'different-invitation-agent' },
      });
      expectExhausted(owned, response);
      await expectMachineInvitationAbsent(owned, email, organizationId);
    }
    owned.token = await issueInvitationToken(fixture);
    const nextTokenEmail = `new-token-${randomUUID()}@test.example`;
    expectExhausted(owned, await postMachineInvitation(owned, nextTokenEmail));
    await expectMachineInvitationAbsent(owned, nextTokenEmail);
    await serviceAccounts.setServiceAccount(fixture.lifecycle.client.id, {
      targets: [fixture.lifecycle.target, fixture.lifecycle.otherTarget],
    }, fixture.lifecycle.actor);
    owned.token = await issueInvitationToken(fixture);
    const nextVersionEmail = `new-version-${randomUUID()}@test.example`;
    expectExhausted(owned, await postMachineInvitation(owned, nextVersionEmail));
    await expectMachineInvitationAbsent(owned, nextVersionEmail);
    expect(fixture.mail.attempts).toBe(sent);
  });

  it('should admit only one concurrent request for the final client-wide slot', async () => {
    const owned = currentSession();
    const otherOrganizationId = owned.fixture.lifecycle.otherOrganization.id;
    for (let index = 0; index < 29; index += 1) {
      const email = `last-slot-control-${index}-${randomUUID()}@test.example`;
      await expectMachineInvitationCreated(owned, await postMachineInvitation(owned, email), email);
    }
    const firstEmail = `last-slot-first-${randomUUID()}@test.example`;
    const secondEmail = `last-slot-second-${randomUUID()}@test.example`;
    const responses = await Promise.all([
      postMachineInvitation(owned, firstEmail),
      postMachineInvitation(owned, secondEmail, otherOrganizationId),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 429]);
    for (const [index, response] of responses.entries()) {
      const email = index === 0 ? firstEmail : secondEmail;
      const organizationId = index === 0 ? owned.fixture.lifecycle.organization.id : otherOrganizationId;
      if (response.status === 201) {
        await expectMachineInvitationCreated(owned, response, email, 'sent', organizationId);
      } else {
        expectExhausted(owned, response);
        await expectMachineInvitationAbsent(owned, email, organizationId);
      }
    }
  });

  it('should fail closed on the exact counter wrong type while native token lookup stays healthy', async () => {
    const owned = currentSession();
    const control = `counter-control-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(owned, await postMachineInvitation(owned, control), control);
    const redis = getRedis();
    const key = counterKey(owned.fixture.lifecycle.client.id);
    expect(counterKey(owned.fixture.lifecycle.client.id)).toBe(key);
    expect(counterKey(randomUUID()) === key).toBe(false);
    const healthKey = `machine-invitation-health:${randomUUID()}`;
    const email = `counter-unavailable-${randomUUID()}@test.example`;
    const sent = owned.fixture.mail.attempts;
    try {
      await redis.set(healthKey, 'healthy');
      await redis.del(key);
      await redis.lpush(key, 'owned-counter-fault');
      expect(await redis.type(key)).toBe('list');
      expect(await redis.get(healthKey)).toBe('healthy');
      const native = await owned.fixture.provider.ClientCredentials.find(owned.token);
      expect(Boolean(native)).toBe(true);
      expectSafeMachineFailure(owned, await postMachineInvitation(owned, email), 503);
      await expectMachineInvitationAbsent(owned, email);
      expect(owned.fixture.mail.attempts).toBe(sent);
      expect(await redis.get(healthKey)).toBe('healthy');
      expect(Boolean(await owned.fixture.provider.ClientCredentials.find(owned.token))).toBe(true);
    } finally {
      await redis.del(key, healthKey);
    }
    const recovered = `counter-recovered-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(owned, await postMachineInvitation(owned, recovered), recovered);
  });

  it('should fail closed during an owned database outage without claiming a query-specific fault', async () => {
    const owned = currentSession();
    const control = `database-control-${randomUUID()}@test.example`;
    await expectMachineInvitationCreated(owned, await postMachineInvitation(owned, control), control);
    const email = `database-unavailable-${randomUUID()}@test.example`;
    const sent = owned.fixture.mail.attempts;
    try {
      await disconnectDatabase();
      expectSafeMachineFailure(owned, await postMachineInvitation(owned, email), 503);
      expect(owned.fixture.mail.attempts).toBe(sent);
    } finally {
      await connectDatabase();
    }
    await expectMachineInvitationAbsent(owned, email);
  });
});
