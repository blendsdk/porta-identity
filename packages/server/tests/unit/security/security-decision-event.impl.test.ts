import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { writeAuditLogInTransaction } from '../../../src/lib/audit-log.js';
import {
  finalizeSecurityDecision,
  getSecurityDecisionSinkFailureCount,
  initializeSecurityDecision,
  normalizedRouteTemplate,
  recordSecurityDecision,
  recordSecurityReference,
} from '../../../src/security/decision-context.js';
import {
  createSecurityDecisionEvent,
  securityDecisionEventSchema,
  SecurityReferenceProtector,
  type SecurityDecisionEvent,
} from '../../../src/security/decision-event.js';
import { attachTransportDecisionHandler } from '../../../src/security/transport-decision.js';

/** Create a minimal request context for direct finalization tests. */
function requestContext(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    state: {},
    method: 'GET',
    path: '/api/admin/users/raw-user-id',
    status: 403,
    _matchedRoute: '/api/admin/users/:id',
    ...overrides,
  };
}

/** Build one valid event input for strict-schema mutation tests. */
function validEvent(): SecurityDecisionEvent {
  return createSecurityDecisionEvent({
    requestId: randomUUID(),
    surface: 'admin-api',
    method: 'GET',
    routeTemplate: '/api/admin/users/:id',
    statusCode: 403,
    outcome: 'deny',
    decisionPoint: 'permission',
    reasonCode: 'permission-required',
  });
}

describe('security decision event implementation', () => {
  it('should reject unknown top-level and detail fields', () => {
    expect(() =>
      securityDecisionEventSchema.parse({ ...validEvent(), password: 'canary' }),
    ).toThrow();
    expect(() =>
      createSecurityDecisionEvent({
        requestId: randomUUID(),
        surface: 'admin-api',
        method: 'GET',
        routeTemplate: '/api/admin/users/:id',
        statusCode: 400,
        outcome: 'deny',
        decisionPoint: 'validation',
        reasonCode: 'schema-invalid',
        detail: { validationSchemaId: 'admin-user', rawInput: 'canary' } as never,
      }),
    ).toThrow();
  });

  it('should reject terminal outcomes and reasons which contradict the public status', () => {
    expect(() =>
      createSecurityDecisionEvent({
        requestId: randomUUID(),
        surface: 'admin-api',
        method: 'POST',
        routeTemplate: '/api/admin/users',
        statusCode: 400,
        outcome: 'allow',
        decisionPoint: 'handler',
        reasonCode: 'allowed',
      }),
    ).toThrow();
    expect(() =>
      createSecurityDecisionEvent({
        requestId: randomUUID(),
        surface: 'admin-api',
        method: 'POST',
        routeTemplate: '/api/admin/users',
        statusCode: 503,
        outcome: 'error',
        decisionPoint: 'handler',
        reasonCode: 'schema-invalid',
      }),
    ).toThrow();
    expect(() =>
      createSecurityDecisionEvent({
        requestId: randomUUID(),
        surface: 'admin-api',
        method: 'GET',
        routeTemplate: '/api/admin/users/:id',
        statusCode: 403,
        outcome: 'deny',
        decisionPoint: 'validation',
        reasonCode: 'permission-required',
      }),
    ).toThrow();
  });

  it.each([
    [401, 'authentication', 'authentication-required'],
    [403, 'permission', 'permission-required'],
    [400, 'validation', 'schema-invalid'],
    [404, 'resource', 'route-not-found'],
    [405, 'validation', 'method-not-allowed'],
  ] as const)(
    'should classify an unrecorded %i response as a denial at the exact boundary',
    async (status, decisionPoint, reasonCode) => {
      const context = requestContext({ status });
      initializeSecurityDecision(context as never, randomUUID());

      const event = await finalizeSecurityDecision(context as never, vi.fn());

      expect(event).toMatchObject({
        statusCode: status,
        outcome: 'deny',
        decisionPoint,
        reasonCode,
      });
    },
  );

  it('should retain only domain-separated protected references for raw identity canaries', async () => {
    const canary = 'protected@example.test';
    const context = requestContext();
    initializeSecurityDecision(context as never, randomUUID());
    recordSecurityDecision(context as never, {
      decisionPoint: 'permission',
      reasonCode: 'permission-required',
    });
    recordSecurityReference(context as never, 'actor', canary);
    recordSecurityReference(context as never, 'tenant', canary);

    const event = await finalizeSecurityDecision(context as never, vi.fn());

    expect(event).not.toBeNull();
    expect(JSON.stringify(event)).not.toContain(canary);
    expect(event?.actorRef).toMatch(/^hmac-sha256:[a-f0-9]{64}$/);
    expect(event?.tenantRef).toMatch(/^hmac-sha256:[a-f0-9]{64}$/);
    expect(event?.actorRef).not.toBe(event?.tenantRef);
  });

  it('should use only registered safe route templates and closed fallbacks', () => {
    expect(normalizedRouteTemplate(requestContext() as never)).toBe('/api/admin/users/:id');
    expect(
      normalizedRouteTemplate(
        requestContext({ _matchedRoute: '/api/admin/users/raw-user-id?token=canary' }) as never,
      ),
    ).toBe('/api/admin/unmatched');
    expect(
      normalizedRouteTemplate(
        requestContext({
          path: '/alpha/auth/magic-link/raw-token',
          _matchedRoute: '../secret',
        }) as never,
      ),
    ).toBe('/:organization/auth/unmatched');
  });

  it('should verify prior references only while the prior key remains retained', () => {
    const priorKey = 'prior-cookie-key-with-at-least-thirty-two-characters';
    const activeKey = 'active-cookie-key-with-at-least-thirty-two-characters';
    const prior = new SecurityReferenceProtector([priorKey]);
    const rotated = new SecurityReferenceProtector([activeKey, priorKey]);
    const activeOnly = new SecurityReferenceProtector([activeKey]);
    const reference = prior.protect('resource', 'resource-id');

    expect(rotated.verify('resource', 'resource-id', reference, prior.activeKeyId)).toBe(true);
    expect(activeOnly.verify('resource', 'resource-id', reference, prior.activeKeyId)).toBe(false);
    expect(rotated.verify('actor', 'resource-id', reference, prior.activeKeyId)).toBe(false);
  });

  it('should emit at most once and preserve the public result when the sink fails', async () => {
    const context = requestContext();
    initializeSecurityDecision(context as never, randomUUID());
    recordSecurityDecision(context as never, {
      decisionPoint: 'permission',
      reasonCode: 'permission-required',
    });
    const before = getSecurityDecisionSinkFailureCount();

    const first = await finalizeSecurityDecision(context as never, async () => {
      throw new Error('sink unavailable');
    });
    const second = await finalizeSecurityDecision(context as never, vi.fn());

    expect(first).toMatchObject({ statusCode: 403, outcome: 'deny' });
    expect(second).toBeNull();
    expect(context.status).toBe(403);
    expect(getSecurityDecisionSinkFailureCount()).toBe(before + 1);
  });

  it('should deduplicate repeated parser errors from the same socket', async () => {
    const events: SecurityDecisionEvent[] = [];
    const server = createServer();
    const socket = new Socket();
    const end = vi.spyOn(socket, 'end').mockReturnValue(socket);
    const detach = attachTransportDecisionHandler(server, (event) => events.push(event));

    server.emit('clientError', new Error('raw parser canary'), socket);
    server.emit('clientError', new Error('different raw parser canary'), socket);
    await new Promise((resolve) => setImmediate(resolve));
    detach();
    socket.destroy();

    expect(events).toHaveLength(1);
    expect(end).toHaveBeenCalledOnce();
    expect(JSON.stringify(events[0])).not.toContain('parser canary');
  });

  it('should close the parser socket when the transport sink throws synchronously', async () => {
    const server = createServer();
    const socket = new Socket();
    const end = vi.spyOn(socket, 'end').mockReturnValue(socket);
    const before = getSecurityDecisionSinkFailureCount();
    const detach = attachTransportDecisionHandler(server, () => {
      throw new Error('synchronous sink failure');
    });

    server.emit('clientError', new Error('raw parser canary'), socket);
    await new Promise((resolve) => setImmediate(resolve));
    detach();
    socket.destroy();

    expect(end).toHaveBeenCalledOnce();
    expect(getSecurityDecisionSinkFailureCount()).toBe(before + 1);
  });

  it('should propagate transaction-bound audit failure to the mutation owner', async () => {
    const failure = new Error('audit storage unavailable');
    const query = vi.fn().mockRejectedValue(failure);

    await expect(
      writeAuditLogInTransaction({ query } as never, {
        organizationId: randomUUID(),
        actorId: randomUUID(),
        eventType: 'admin.import',
        eventCategory: 'administrative-data',
      }),
    ).rejects.toBe(failure);
    expect(query).toHaveBeenCalledOnce();
  });
});
