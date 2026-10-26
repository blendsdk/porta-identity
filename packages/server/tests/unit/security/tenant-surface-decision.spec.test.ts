/**
 * End-to-end security-event coverage for the tenant API surface.
 *
 * The tenant middleware records the same decision and protected-reference
 * facts as the admin boundary. This test verifies that finalization actually
 * emits a tenant event instead of dropping the request-local state.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  finalizeSecurityDecision,
  initializeSecurityDecision,
  recordSecurityDecision,
  recordSecurityReference,
} from '../../../src/security/decision-context.js';

describe('tenant security decision event', () => {
  it('emits a strict tenant-api event with protected actor and tenant references', async () => {
    const ctx = {
      path: '/api/organizations/11111111-1111-4111-8111-111111111111/users/invite',
      method: 'POST',
      status: 403,
      state: {},
      _matchedRoute: '/api/organizations/:orgId/users/invite',
    };
    initializeSecurityDecision(ctx as never, randomUUID());
    recordSecurityDecision(ctx as never, {
      decisionPoint: 'permission',
      reasonCode: 'permission-required',
      outcome: 'deny',
    });
    recordSecurityReference(ctx as never, 'actor', 'bff-client');
    recordSecurityReference(ctx as never, 'tenant', '11111111-1111-4111-8111-111111111111');

    const sink = vi.fn();
    const event = await finalizeSecurityDecision(ctx as never, sink);

    expect(event).toMatchObject({
      surface: 'tenant-api',
      method: 'POST',
      routeTemplate: '/api/organizations/:orgId/users/invite',
      statusCode: 403,
      outcome: 'deny',
      decisionPoint: 'permission',
      reasonCode: 'permission-required',
    });
    expect(event?.actorRef).toMatch(/^hmac-sha256:[a-f0-9]{64}$/);
    expect(event?.tenantRef).toMatch(/^hmac-sha256:[a-f0-9]{64}$/);
    expect(event?.referenceKeyId).toMatch(/^sha256:[a-f0-9]{16}$/);
    expect(sink).toHaveBeenCalledWith(event);
  });
});
