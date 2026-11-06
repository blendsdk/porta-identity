import type Router from '@koa/router';
import { z } from 'zod';
import { runDatabaseTransaction } from '../lib/database.js';
import {
  getServiceAccount, setServiceAccount, revokeServiceAccount, findServiceAccountByClientId,
  ServiceAccountAuthorizationError, ServiceAccountManagementError, ServiceAccountValidationError,
  ServiceAccountConflictError, ServiceAccountNotFoundError, ServiceAccountStorageError,
} from '../service-accounts/index.js';
import { lockServiceAccountParent } from '../service-accounts/repository.js';
import { requireServiceAccountManager } from '../service-accounts/lifecycle-authority.js';

/** Mount the human-only binding subresource on the already authenticated client router. */
export function registerClientServiceAccountRoutes(router: Router): void {
  for (const method of ['get', 'put', 'delete'] as const) {
    router[method]('/:id/service-account', async (ctx) => {
      try {
        const actor = ctx.state.adminUser;
        if (!actor) { ctx.throw(401, 'Authentication required'); return; }
        if (!z.string().uuid().safeParse(ctx.params.id).success) throw new ServiceAccountValidationError();
        await runDatabaseTransaction(async () => {
          // Authorization precedes existence/ownership disclosure and is revalidated by the service.
          await lockServiceAccountParent(ctx.params.id);
          await requireServiceAccountManager(actor.id);
          if (method === 'get') {
            ctx.body = { data: await getServiceAccount(ctx.params.id, actor) };
            ctx.status = 200;
          } else if (method === 'put') {
            const previous = await findServiceAccountByClientId(ctx.params.id);
            ctx.body = { data: await setServiceAccount(ctx.params.id, ctx.request.body, actor) };
            ctx.status = previous ? 200 : 201;
          } else {
            await revokeServiceAccount(ctx.params.id, actor);
            ctx.status = 204;
          }
        });
      } catch (error) {
        const status = error instanceof ServiceAccountManagementError || error instanceof ServiceAccountAuthorizationError ? 403
          : error instanceof ServiceAccountValidationError ? 400
            : error instanceof ServiceAccountConflictError ? 409
              : error instanceof ServiceAccountNotFoundError ? 404
                : error instanceof ServiceAccountStorageError ? 503 : undefined;
        if (status === undefined) throw error;
        ctx.status = status;
        ctx.body = { error: status === 403 ? 'Forbidden' : status === 400 ? 'Service-account request is invalid'
          : status === 409 ? 'Service-account ownership conflict' : status === 404 ? 'Service-account not found' : 'Service unavailable' };
      }
    });
  }
}
