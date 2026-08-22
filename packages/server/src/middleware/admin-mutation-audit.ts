import type { Middleware } from 'koa';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { getDatabaseTransactionClient, runDatabaseTransaction } from '../lib/database.js';
import { normalizedRouteTemplate, recordSecurityDecision } from '../security/decision-context.js';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SELF_MANAGED_MUTATION_PREFIXES = ['/api/admin/bulk', '/api/admin/import'];

/** Internal signal used to roll back a handled non-success response without replacing its body. */
class HandledMutationRejection extends Error {}

/** Koa-compatible errors retain their public status after the transaction rolls back. */
function isPublicHttpError(error: unknown): error is Error & { status: number } {
  if (!(error instanceof Error)) return false;
  const status = Reflect.get(error, 'status');
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** Return whether a request belongs to the generic administrative mutation transaction. */
function ownsAdministrativeMutation(method: string, path: string): boolean {
  return (
    MUTATION_METHODS.has(method) &&
    path.startsWith('/api/admin/') &&
    !SELF_MANAGED_MUTATION_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

/**
 * Atomically bind successful administrative mutations to one durable audit row.
 *
 * Bulk and import own specialized transaction/result semantics and are excluded here. Every other
 * state-changing admin request shares one request-local PostgreSQL client across repository calls.
 */
export function adminMutationAudit(): Middleware {
  return async (ctx, next) => {
    if (!ownsAdministrativeMutation(ctx.method, ctx.path)) {
      await next();
      return;
    }

    try {
      await runDatabaseTransaction(async () => {
        await next();
        if (ctx.status >= 400) throw new HandledMutationRejection();

        const client = getDatabaseTransactionClient();
        if (!client) throw new Error('Administrative mutation transaction is unavailable');
        const actor = ctx.state.adminUser;
        if (!actor) throw new Error('Administrative mutation actor is unavailable');
        await writeAuditLogInTransaction(client, {
          organizationId: actor.organizationId,
          actorId: actor.id,
          eventType: 'admin.mutation.committed',
          eventCategory: 'admin',
          metadata: {
            method: ctx.method,
            routeTemplate: normalizedRouteTemplate(ctx),
          },
        });
      });
    } catch (error) {
      if (error instanceof HandledMutationRejection) return;
      if (isPublicHttpError(error)) throw error;
      recordSecurityDecision(ctx, {
        decisionPoint: 'handler',
        reasonCode: 'handler-failed',
        outcome: 'error',
      });
      ctx.status = 503;
      ctx.body = {
        error: 'Administrative request could not be completed',
        code: 'admin_mutation_unavailable',
        requestId: ctx.state.requestId,
      };
    }
  };
}
