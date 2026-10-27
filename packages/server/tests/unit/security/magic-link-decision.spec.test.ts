/** Authentication decisions must identify HEAD and distinguish rejected logins from bad schemas. */
import { createServer, type Server } from 'node:http';
import Koa from 'koa';
import Router from '@koa/router';
import { afterEach, describe, expect, it } from 'vitest';
import { requestLogger } from '../../../src/middleware/request-logger.js';
import { recordSecurityDecision } from '../../../src/security/decision-context.js';
import type { SecurityDecisionEvent } from '../../../src/security/decision-event.js';

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
    server = undefined;
  }
});

describe('magic-link decision vocabulary', () => {
  it.each(['HEAD', 'GET'] as const)(
    'should retain the method and exact rejection boundary for %s',
    async (method) => {
      const events: SecurityDecisionEvent[] = [];
      const app = new Koa();
      const router = new Router();
      app.use(
        requestLogger((event) => {
          events.push(event);
        }),
      );
      router.get('/:orgSlug/auth/magic-link/:token', (ctx) => {
        ctx.status = method === 'HEAD' ? 405 : 400;
        if (method === 'GET') {
          recordSecurityDecision(ctx, {
            decisionPoint: 'authentication',
            reasonCode: 'authentication-rejected',
            outcome: 'deny',
          });
        }
      });
      app.use(router.routes());
      server = createServer(app.callback());
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test listener');

      const response = await fetch(
        `http://127.0.0.1:${address.port}/tenant/auth/magic-link/bearer-canary`,
        { method },
      );
      await response.text();
      expect(response.status).toBe(method === 'HEAD' ? 405 : 400);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        method,
        outcome: 'deny',
        decisionPoint: method === 'HEAD' ? 'validation' : 'authentication',
        reasonCode: method === 'HEAD' ? 'method-not-allowed' : 'authentication-rejected',
        routeTemplate: '/:orgSlug/auth/magic-link/:token',
      });
      expect(JSON.stringify(events)).not.toContain('bearer-canary');
    },
  );
});
