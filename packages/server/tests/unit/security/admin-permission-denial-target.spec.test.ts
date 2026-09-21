import { describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/index.js';
import { requestLogger } from '../../../src/middleware/request-logger.js';
import { requirePermission } from '../../../src/middleware/require-permission.js';
import { recordSecurityReference } from '../../../src/security/decision-context.js';
import type { SecurityDecisionSink } from '../../../src/security/decision-context.js';
import {
  SecurityReferenceProtector,
  type SecurityDecisionEvent,
} from '../../../src/security/decision-event.js';

/**
 * Immutable contract for administrative permission-denial security events.
 *
 * The assurance requirement for administrative data (ST-57 through ST-61) needs each denial to be
 * correlatable and to name the protected target without disclosing raw identifiers. This suite
 * pins the actor, action, target digest, and result that a permissions denial must expose.
 */

/** Create the minimum Koa context needed by correlation and permission middleware. */
function adminContext(
  permissions: readonly string[],
  params: Record<string, string> = {},
): Record<string, unknown> {
  return {
    req: {},
    params,
    state: {
      adminUser: {
        id: 'actor-id',
        email: 'protected@example.test',
        organizationId: 'tenant-id',
        roles: ['porta-auditor'],
        permissions,
      },
    },
    status: 404,
    body: undefined,
    method: 'GET',
    path: '/api/admin/audit',
    url: '/api/admin/audit?protected=raw',
    _matchedRoute: '/api/admin/audit',
    set: vi.fn(),
  };
}

/** Run a permission check inside the real correlation middleware and capture one event. */
async function runDenial(
  permissions: readonly string[],
  params: Record<string, string>,
): Promise<SecurityDecisionEvent> {
  const events: SecurityDecisionEvent[] = [];
  const sink: SecurityDecisionSink = (event) => events.push(event);
  const ctx = adminContext(permissions, params);

  await requestLogger(sink)(ctx as never, async () => {
    recordSecurityReference(ctx as never, 'actor', 'actor-id');
    recordSecurityReference(ctx as never, 'tenant', 'tenant-id');
    await requirePermission('admin:audit:read')(ctx as never, vi.fn());
  });

  expect(events).toHaveLength(1);
  return events[0];
}

describe('administrative permission-denial target digest', () => {
  it('names the protected route target without disclosing raw identifiers', async () => {
    const event = await runDenial([], { id: 'resource-123' });
    const protector = new SecurityReferenceProtector(config.cookieKeys);

    expect(event).toMatchObject({
      statusCode: 403,
      outcome: 'deny',
      decisionPoint: 'permission',
      reasonCode: 'permission-required',
      detail: { permissions: ['admin:audit:read'] },
    });
    expect(event.actorRef).toBe(protector.protect('actor', 'actor-id'));
    expect(event.resourceRef).toBe(protector.protect('resource', 'resource-123'));

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('resource-123');
    expect(serialized).not.toContain('actor-id');
    expect(serialized).not.toContain('protected@example.test');
  });

  it('falls back to the actor organization when the route has no target parameter', async () => {
    const event = await runDenial([], {});
    const protector = new SecurityReferenceProtector(config.cookieKeys);

    expect(event.resourceRef).toBe(protector.protect('resource', 'tenant-id'));
  });

  it('prefers an explicit user identifier over a generic id', async () => {
    const event = await runDenial([], { id: 'generic-1', userId: 'user-9' });
    const protector = new SecurityReferenceProtector(config.cookieKeys);

    expect(event.resourceRef).toBe(protector.protect('resource', 'user-9'));
  });
});
