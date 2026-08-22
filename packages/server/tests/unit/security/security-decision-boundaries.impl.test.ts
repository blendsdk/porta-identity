import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLogger } from '../../../src/middleware/request-logger.js';
import { requirePermission } from '../../../src/middleware/require-permission.js';
import {
  getSecurityDecisionSinkFailureCount,
  type SecurityDecisionSink,
} from '../../../src/security/decision-context.js';
import type { SecurityDecisionEvent } from '../../../src/security/decision-event.js';
import { attachTransportDecisionHandler } from '../../../src/security/transport-decision.js';

const openServers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    [...openServers].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  openServers.clear();
});

/** Create the minimum Koa context needed by correlation and permission middleware. */
function adminContext(permissions?: readonly string[]): Record<string, unknown> {
  return {
    req: {},
    state:
      permissions === undefined
        ? {}
        : {
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
    path: '/api/admin/assurance',
    url: '/api/admin/assurance?protected=raw',
    _matchedRoute: '/api/admin/assurance',
    set: vi.fn(),
  };
}

describe('security decision production boundaries', () => {
  it.each([
    [undefined, 401, 'authentication', 'authentication-required'],
    [[], 403, 'permission', 'permission-required'],
  ] as const)(
    'should finalize one exact admin denial for permissions %j',
    async (permissions, status, decisionPoint, reasonCode) => {
      const events: SecurityDecisionEvent[] = [];
      const sink: SecurityDecisionSink = (event) => events.push(event);
      const ctx = adminContext(permissions);

      await requestLogger(sink)(ctx as never, () =>
        requirePermission('admin:user:read')(ctx as never, vi.fn()),
      );

      expect(ctx).toMatchObject({ status });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        statusCode: status,
        outcome: 'deny',
        decisionPoint,
        reasonCode,
        routeTemplate: '/api/admin/assurance',
      });
      expect(JSON.stringify(events[0])).not.toContain('protected@example.test');
      expect(JSON.stringify(events[0])).not.toContain('?protected=raw');
    },
  );

  it('should preserve a permission denial when the terminal sink fails', async () => {
    const before = getSecurityDecisionSinkFailureCount();
    const ctx = adminContext([]);

    await requestLogger(async () => {
      throw new Error('sink unavailable');
    })(ctx as never, () => requirePermission('admin:user:read')(ctx as never, vi.fn()));

    expect(ctx).toMatchObject({ status: 403 });
    expect(getSecurityDecisionSinkFailureCount()).toBe(before + 1);
  });

  it('should emit one closed event for a real Node HTTP parser rejection', async () => {
    const events: SecurityDecisionEvent[] = [];
    const server = createServer((_request, response) => response.end());
    openServers.add(server);
    attachTransportDecisionHandler(server, (event) => events.push(event));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing TCP address');

    const response = await new Promise<string>((resolve, reject) => {
      const socket = createConnection({ host: '127.0.0.1', port: address.port });
      let received = '';
      socket.setEncoding('utf8');
      socket.on('connect', () => socket.write('GET / HTTP/1.1\r\nInvalid Header\r\n\r\n'));
      socket.on('data', (chunk: string) => {
        received += chunk;
      });
      socket.on('end', () => resolve(received));
      socket.on('error', reject);
    });

    expect(response).toBe(
      'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      surface: 'transport',
      method: 'UNKNOWN',
      routeTemplate: '/transport',
      statusCode: 400,
      outcome: 'deny',
      decisionPoint: 'transport',
      reasonCode: 'transport-parse-failed',
    });
  });
});
