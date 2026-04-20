/**
 * Client and secret management API routes.
 *
 * All routes are under `/api/admin/clients` and require
 * super-admin authorization. Provides CRUD for clients,
 * status lifecycle (activate, deactivate, revoke), and nested
 * secret management (generate, list, revoke).
 *
 * Route structure:
 *   POST   /                               — Create a new client
 *   GET    /                               — List clients (paginated)
 *   GET    /:id                            — Get client by ID
 *   PUT    /:id                            — Update client
 *   POST   /:id/revoke                     — Revoke client (permanent)
 *   POST   /:id/activate                   — Activate client
 *   POST   /:id/deactivate                 — Deactivate client
 *   POST   /:id/secrets                    — Generate new secret
 *   GET    /:id/secrets                    — List secrets (no hashes)
 *   POST   /:id/secrets/:secretId/revoke   — Revoke a secret
 *
 * Error mapping:
 *   ClientNotFoundError → 404
 *   ClientValidationError → 400
 *   ZodError → 400 with validation details
 *
 * Important response notes:
 *   - POST / returns 201 with { data: { client, secret } }
 *   - POST /:id/secrets returns 201 with plaintext + warning
 *   - GET /:id/secrets never includes secret_hash
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import * as clientService from '../clients/service.js';
import * as secretService from '../clients/secret-service.js';
import { ClientNotFoundError, ClientValidationError } from '../clients/errors.js';
import * as organizationService from '../organizations/service.js';
import type { Client } from '../clients/types.js';
import { LOGIN_METHODS } from '../clients/types.js';
import { resolveLoginMethods } from '../clients/resolve-login-methods.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * Login method Zod schema — single source of truth for HTTP payload validation.
 * Uses the runtime `LOGIN_METHODS` const so adding a new method only requires
 * updating the union in `src/clients/types.ts`.
 */
const loginMethodSchema = z.enum(LOGIN_METHODS);

/**
 * Client-level login methods — three-state semantics at the HTTP boundary:
 *   - field omitted → undefined  (leave unchanged / use DB default on create)
 *   - `null`         → clear override, inherit org default
 *   - non-empty array → explicit override
 *
 * `.min(1)` rejects empty arrays (service layer also rejects but the 400
 * carries a useful validation message). `.nullable().optional()` allows
 * both `null` and absence.
 */
const clientLoginMethodsSchema = z.array(loginMethodSchema).min(1).nullable();

/** Schema for creating a new client */
const createClientSchema = z.object({
  organizationId: z.string().uuid(),
  applicationId: z.string().uuid(),
  clientName: z.string().min(1).max(255),
  clientType: z.enum(['confidential', 'public']),
  applicationType: z.enum(['web', 'native', 'spa']),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  postLogoutRedirectUris: z.array(z.string().url()).max(10).optional(),
  grantTypes: z.array(z.string()).optional(),
  responseTypes: z.array(z.string()).optional(),
  scope: z.string().optional(),
  tokenEndpointAuthMethod: z.enum([
    'client_secret_basic', 'client_secret_post', 'none',
  ]).optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  requirePkce: z.boolean().optional(),
  loginMethods: clientLoginMethodsSchema.optional(),
  secretLabel: z.string().max(255).optional(),
});

/** Schema for updating a client (all fields optional) */
const updateClientSchema = z.object({
  clientName: z.string().min(1).max(255).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(10).optional(),
  postLogoutRedirectUris: z.array(z.string().url()).max(10).optional(),
  grantTypes: z.array(z.string()).optional(),
  responseTypes: z.array(z.string()).optional(),
  scope: z.string().optional(),
  tokenEndpointAuthMethod: z.enum([
    'client_secret_basic', 'client_secret_post', 'none',
  ]).optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  requirePkce: z.boolean().optional(),
  loginMethods: clientLoginMethodsSchema.optional(),
});

/** Schema for listing clients with pagination and filters */
const listClientsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  organizationId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'revoked']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['client_name', 'created_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Schema for generating a new secret */
const createSecretSchema = z.object({
  label: z.string().max(255).optional(),
  expiresAt: z.coerce.date().optional(),
});

// ---------------------------------------------------------------------------
// Response decoration helper
// ---------------------------------------------------------------------------

/**
 * Attach the computed `effectiveLoginMethods` field to a client before
 * returning it over HTTP.
 *
 * This is the public "resolved view" — API consumers get both the raw
 * override (`loginMethods`, possibly `null`) and the effective array
 * (`effectiveLoginMethods`, always non-empty) so they never have to replicate
 * the inheritance rule on their side.
 *
 * The domain `Client` type is *not* widened to include `effectiveLoginMethods`
 * — that field lives only on the API response, keeping the model a pure
 * projection of the DB row.
 *
 * @param client - Client from the service layer
 * @returns Client decorated with `effectiveLoginMethods`
 */
async function withEffectiveLoginMethods(client: Client): Promise<Client & { effectiveLoginMethods: readonly string[] }> {
  const org = await organizationService.getOrganizationById(client.organizationId);
  const effectiveLoginMethods = org
    ? resolveLoginMethods(org, client)
    // Defensive: if the org went missing after the client was fetched, fall
    // back to the client's explicit override if present, otherwise default.
    : (client.loginMethods ?? ['password', 'magic_link']);
  return { ...client, effectiveLoginMethods };
}

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

/**
 * Handle domain errors and map them to HTTP responses.
 * Unknown errors are re-thrown for the global error handler.
 */
function handleError(ctx: { status: number; body: unknown; throw: (status: number, msg: string) => never }, err: unknown): never {
  if (err instanceof ClientNotFoundError) {
    ctx.throw(404, err.message);
  }
  if (err instanceof ClientValidationError) {
    ctx.throw(400, err.message);
  }
  if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Validation failed', details: err.issues };
    return undefined as never;
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the client management router.
 *
 * All routes require super-admin authorization via the requireSuperAdmin
 * middleware. Provides full CRUD for clients, status lifecycle, and
 * nested secret management.
 *
 * Prefix: /api/admin/clients
 *
 * @returns Configured Koa Router
 */
export function createClientRouter(): Router {
  const router = new Router({ prefix: '/api/admin/clients' });

  // All routes require super-admin access
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST / — Create client
  // -------------------------------------------------------------------------
  router.post('/', async (ctx) => {
    try {
      const body = createClientSchema.parse(ctx.request.body);

      // Create client (returns ClientWithSecret — secret is null here)
      const result = await clientService.createClient(body);

      // For confidential clients, generate the initial secret automatically
      let secret = result.secret;
      if (body.clientType === 'confidential') {
        secret = await secretService.generateAndStore(result.client.id, {
          label: body.secretLabel,
        });
      }

      // Decorate the client with its resolved `effectiveLoginMethods` so
      // API consumers get both the raw override and the effective value.
      const decoratedClient = await withEffectiveLoginMethods(result.client);

      ctx.status = 201;
      ctx.body = {
        data: { client: decoratedClient, secret },
        ...(secret ? { warning: 'Store the secret securely. It will not be shown again.' } : {}),
      };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List clients (paginated)
  // -------------------------------------------------------------------------
  router.get('/', async (ctx) => {
    try {
      const query = listClientsSchema.parse(ctx.query);
      // Use the listClientsByOrganization or generic listing
      // The service accepts full ListClientsOptions
      const result = await clientService.listClientsByOrganization(
        query.organizationId ?? '',
        query,
      );
      ctx.body = result;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get client by ID
  // -------------------------------------------------------------------------
  router.get('/:id', async (ctx) => {
    const client = await clientService.getClientById(ctx.params.id);
    if (!client) {
      ctx.throw(404, 'Client not found');
      return; // unreachable — keeps TS narrowing happy across the call boundary
    }
    ctx.body = { data: await withEffectiveLoginMethods(client) };
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update client
  // -------------------------------------------------------------------------
  router.put('/:id', async (ctx) => {
    try {
      const body = updateClientSchema.parse(ctx.request.body);
      const client = await clientService.updateClient(ctx.params.id, body);
      ctx.body = { data: await withEffectiveLoginMethods(client) };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/revoke — Revoke client (permanent)
  // -------------------------------------------------------------------------
  router.post('/:id/revoke', async (ctx) => {
    try {
      await clientService.revokeClient(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/activate — Activate client
  // -------------------------------------------------------------------------
  router.post('/:id/activate', async (ctx) => {
    try {
      await clientService.activateClient(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/deactivate — Deactivate client
  // -------------------------------------------------------------------------
  router.post('/:id/deactivate', async (ctx) => {
    try {
      await clientService.deactivateClient(ctx.params.id);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/secrets — Generate new secret
  // -------------------------------------------------------------------------
  router.post('/:id/secrets', async (ctx) => {
    try {
      const body = createSecretSchema.parse(ctx.request.body);
      const secret = await secretService.generateAndStore(ctx.params.id, body);
      ctx.status = 201;
      ctx.body = {
        data: secret,
        warning: 'Store the secret securely. It will not be shown again.',
      };
    } catch (err) {
      handleError(ctx, err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id/secrets — List secrets (no hashes)
  // -------------------------------------------------------------------------
  router.get('/:id/secrets', async (ctx) => {
    const secrets = await secretService.listByClient(ctx.params.id);
    ctx.body = { data: secrets };
  });

  // -------------------------------------------------------------------------
  // POST /:id/secrets/:secretId/revoke — Revoke a secret
  // -------------------------------------------------------------------------
  router.post('/:id/secrets/:secretId/revoke', async (ctx) => {
    try {
      await secretService.revoke(ctx.params.secretId);
      ctx.status = 204;
    } catch (err) {
      handleError(ctx, err);
    }
  });

  return router;
}
