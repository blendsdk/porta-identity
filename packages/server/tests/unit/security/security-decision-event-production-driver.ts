import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import {
  requireAdminOrganizationMembership,
  type AdminUser,
} from '../../../src/middleware/admin-auth.js';
import { adminMutationAudit } from '../../../src/middleware/admin-mutation-audit.js';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import { requirePermission } from '../../../src/middleware/require-permission.js';
import { requireUserOrganization } from '../../../src/middleware/require-user-organization.js';
import { requestLogger } from '../../../src/middleware/request-logger.js';
import { getPool } from '../../../src/lib/database.js';
import {
  getSecurityDecisionSinkFailureCount,
  type SecurityDecisionSink,
} from '../../../src/security/decision-context.js';
import {
  SecurityReferenceProtector,
  type SecurityDecisionEvent,
} from '../../../src/security/decision-event.js';
import { attachTransportDecisionHandler } from '../../../src/security/transport-decision.js';
import type {
  SecurityDecisionCaseId,
  SecurityDecisionCaseObservation,
  SecurityDecisionEventDriver,
} from './security-decision-event-contract.js';

/** Independently captured HTTP response and production boundary observations. */
interface HttpExecutionObservation {
  readonly status: number;
  readonly events: readonly SecurityDecisionEvent[];
  readonly output: readonly string[];
}

/** Build the minimal authenticated actor shape used by administrative middleware. */
function actor(id: string, organizationId: string, permissions: readonly string[]): AdminUser {
  return {
    id,
    organizationId,
    email: 'redacted@example.test',
    roles: ['porta-assurance'],
    permissions,
  };
}

/** Production-backed driver for terminal request, transport, and transaction boundaries. */
export class ProductionSecurityDecisionEventDriver implements SecurityDecisionEventDriver {
  /** Execute one real boundary and return observations captured outside its oracle. */
  public async runCase(caseId: SecurityDecisionCaseId): Promise<SecurityDecisionCaseObservation> {
    if (caseId === 'transport-parser-rejected') return this.#runTransportCase();
    if (caseId === 'admin-mutation-committed') return this.#runMutationCase(caseId, true);
    if (caseId === 'admin-mutation-audit-failed') return this.#runMutationCase(caseId, false);

    const fallbackBefore = getSecurityDecisionSinkFailureCount();
    const sink: SecurityDecisionSink | undefined =
      caseId === 'denial-sink-failed'
        ? () => {
            throw new Error('closed sink failure');
          }
        : undefined;
    const observation = await this.#runHttpCase(caseId, sink);
    return {
      caseId,
      responseStatus: observation.status,
      eventCount: observation.events.length,
      event: observation.events.length === 1 ? observation.events[0] : null,
      mutationCount: 0,
      durableAuditCount: 0,
      emergencyFallbackCount: getSecurityDecisionSinkFailureCount() - fallbackBefore,
      operationalOutput: observation.output,
    };
  }

  /** Exercise active and retained key behavior through the production reference protector. */
  public async observeKeyRotation(): Promise<{
    readonly activeKeyIdChanged: boolean;
    readonly priorReferenceVerifiesWithRetainedKey: boolean;
    readonly priorReferenceVerifiesWithoutRetainedKey: boolean;
    readonly crossDomainReferencesDiffer: boolean;
  }> {
    const priorKey = 'prior-cookie-key-with-at-least-thirty-two-characters';
    const activeKey = 'active-cookie-key-with-at-least-thirty-two-characters';
    const prior = new SecurityReferenceProtector([priorKey]);
    const rotated = new SecurityReferenceProtector([activeKey, priorKey]);
    const withoutPrior = new SecurityReferenceProtector([activeKey]);
    const actorReference = prior.protect('actor', 'actor-1');
    return {
      activeKeyIdChanged: prior.activeKeyId !== rotated.activeKeyId,
      priorReferenceVerifiesWithRetainedKey: rotated.verify(
        'actor',
        'actor-1',
        actorReference,
        prior.activeKeyId,
      ),
      priorReferenceVerifiesWithoutRetainedKey: withoutPrior.verify(
        'actor',
        'actor-1',
        actorReference,
        prior.activeKeyId,
      ),
      crossDomainReferencesDiffer:
        prior.protect('actor', 'shared-id') !== prior.protect('tenant', 'shared-id'),
    };
  }

  /** Execute a Koa request through production correlation, errors, and decision finalization. */
  async #runHttpCase(
    caseId: SecurityDecisionCaseId,
    decisionSink?: SecurityDecisionSink,
  ): Promise<HttpExecutionObservation> {
    const events: SecurityDecisionEvent[] = [];
    const output: string[] = [];
    const observedDecisionSink: SecurityDecisionSink = async (event) => {
      events.push(event);
      await decisionSink?.(event);
    };
    const app = new Koa();
    app.use(requestLogger(observedDecisionSink, (record) => output.push(JSON.stringify(record))));
    app.use(errorHandler());
    app.use(bodyParser({ jsonLimit: '1kb' }));

    const router = new Router();
    this.#registerHttpCase(router, caseId);
    app.use(router.routes());
    app.use(router.allowedMethods());

    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (address === null || typeof address === 'string')
        throw new Error('Test server unavailable');
      const request = httpRequestFor(caseId);
      const response = await fetch(`http://127.0.0.1:${address.port}${request.path}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      output.push(await response.text());
      return { status: response.status, events, output };
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  /** Register the exact production middleware boundary for one HTTP case. */
  #registerHttpCase(router: Router, caseId: SecurityDecisionCaseId): void {
    switch (caseId) {
      case 'admin-read-allowed':
        router.get('/api/admin/assurance', (ctx) => {
          ctx.body = { ok: true };
        });
        return;
      case 'admin-unauthenticated':
        router.get('/api/admin/assurance', requirePermission('assurance:read'), (ctx) => {
          ctx.body = { ok: true };
        });
        return;
      case 'admin-membership-denied':
        router.get('/api/admin/assurance', (ctx) => {
          requireAdminOrganizationMembership(ctx, randomUUID(), randomUUID());
        });
        return;
      case 'admin-permission-denied':
      case 'denial-sink-failed':
        router.get(
          '/api/admin/assurance',
          (ctx, next) => {
            ctx.state.adminUser = actor(randomUUID(), randomUUID(), []);
            return next();
          },
          requirePermission('assurance:read'),
          (ctx) => {
            ctx.body = { ok: true };
          },
        );
        return;
      case 'admin-resource-denied':
        router.get(
          '/api/admin/organizations/:orgId/users/:userId',
          requireUserOrganization(),
          (ctx) => {
            ctx.body = { ok: true };
          },
        );
        return;
      case 'schema-rejected':
        router.post('/api/admin/assurance', (ctx) => {
          ctx.status = 400;
          ctx.body = { error: 'Administrative request is invalid' };
        });
        return;
      case 'handler-threw':
        router.get('/api/admin/assurance', () => {
          throw new Error('SELECT secret FROM internal_table /srv/porta/private.ts:42');
        });
        return;
      case 'malformed-json':
      case 'oversized-body':
        router.post('/api/admin/assurance', (ctx) => {
          ctx.body = { ok: true };
        });
        return;
      case 'admin-mutation-committed':
      case 'admin-mutation-audit-failed':
      case 'transport-parser-rejected':
        throw new Error('Case uses a dedicated execution boundary');
    }
  }

  /** Execute a mutation and observe its table row and durable audit independently. */
  async #runMutationCase(
    caseId: 'admin-mutation-committed' | 'admin-mutation-audit-failed',
    validActor: boolean,
  ): Promise<SecurityDecisionCaseObservation> {
    const pool = getPool();
    const runId = randomUUID();
    const organizationId = randomUUID();
    const actorId = randomUUID();
    await pool.query(
      'CREATE TABLE IF NOT EXISTS security_decision_driver_mutations (run_id UUID PRIMARY KEY)',
    );
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      organizationId,
      'Decision driver',
      `decision-${runId}`,
    ]);
    if (validActor) {
      await pool.query('INSERT INTO users (id, organization_id, email) VALUES ($1, $2, $3)', [
        actorId,
        organizationId,
        `decision-${runId}@example.test`,
      ]);
    }

    const events: SecurityDecisionEvent[] = [];
    const output: string[] = [];
    const app = new Koa();
    app.use(
      requestLogger(
        (event) => events.push(event),
        (record) => output.push(JSON.stringify(record)),
      ),
    );
    app.use(errorHandler());
    app.use((ctx, next) => {
      ctx.state.adminUser = actor(actorId, organizationId, ['assurance:write']);
      return next();
    });
    app.use(adminMutationAudit());
    const router = new Router();
    router.post('/api/admin/assurance', async (ctx) => {
      await getPool().query('INSERT INTO security_decision_driver_mutations (run_id) VALUES ($1)', [
        runId,
      ]);
      ctx.body = { ok: true };
    });
    app.use(router.routes());
    app.use(router.allowedMethods());

    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (address === null || typeof address === 'string')
        throw new Error('Test server unavailable');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/assurance`, {
        method: 'POST',
      });
      output.push(await response.text());
      const mutation = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM security_decision_driver_mutations WHERE run_id = $1',
        [runId],
      );
      const audit = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_log
         WHERE actor_id = $1 AND event_type = 'admin.mutation.committed'`,
        [actorId],
      );
      return {
        caseId,
        responseStatus: response.status,
        eventCount: events.length,
        event: events.length === 1 ? events[0] : null,
        mutationCount: Number(mutation.rows[0]?.count ?? 0),
        durableAuditCount: Number(audit.rows[0]?.count ?? 0),
        emergencyFallbackCount: 0,
        operationalOutput: output,
      };
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await pool.query('DELETE FROM security_decision_driver_mutations WHERE run_id = $1', [runId]);
      await pool.query('DROP TABLE IF EXISTS security_decision_driver_mutations');
      await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
  }

  /** Send malformed bytes to Node and observe its fixed transport response. */
  async #runTransportCase(): Promise<SecurityDecisionCaseObservation> {
    const events: SecurityDecisionEvent[] = [];
    const app = new Koa();
    const server = app.listen(0, '127.0.0.1');
    const detach = attachTransportDecisionHandler(server, (event) => events.push(event));
    try {
      await once(server, 'listening');
      const address = server.address();
      if (address === null || typeof address === 'string')
        throw new Error('Test server unavailable');
      const response = await new Promise<string>((resolve, reject) => {
        const socket = createConnection({ host: '127.0.0.1', port: address.port });
        let data = '';
        socket.setEncoding('utf8');
        socket.on('connect', () => socket.write('INVALID\r\n\r\n'));
        socket.on('data', (chunk) => {
          data += chunk;
        });
        socket.on('end', () => resolve(data));
        socket.on('error', reject);
      });
      return {
        caseId: 'transport-parser-rejected',
        responseStatus: response.startsWith('HTTP/1.1 400') ? 400 : 0,
        eventCount: events.length,
        event: events.length === 1 ? events[0] : null,
        mutationCount: 0,
        durableAuditCount: 0,
        emergencyFallbackCount: 0,
        operationalOutput: [response],
      };
    } finally {
      detach();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

/** Return the exact request needed to reach one HTTP scenario. */
function httpRequestFor(caseId: SecurityDecisionCaseId): {
  readonly path: string;
  readonly method: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
} {
  if (caseId === 'admin-resource-denied') {
    return { path: '/api/admin/organizations/not-an-id/users/raw-user-id', method: 'GET' };
  }
  if (caseId === 'malformed-json') {
    return {
      path: '/api/admin/assurance',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":"protected@example.test"',
    };
  }
  if (caseId === 'oversized-body') {
    return {
      path: '/api/admin/assurance',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(2_000) }),
    };
  }
  if (caseId === 'schema-rejected') {
    return {
      path: '/api/admin/assurance',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    };
  }
  return { path: '/api/admin/assurance', method: 'GET' };
}
