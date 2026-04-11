/**
 * Client service — business logic orchestrator.
 *
 * Composes the repository, cache, validators, crypto utilities, and audit log
 * to provide the complete client management API. All write operations follow:
 *   1. Validate inputs (org, app, URIs)
 *   2. Perform DB operation (via repository)
 *   3. Invalidate + re-cache (via cache)
 *   4. Write audit log (fire-and-forget)
 *
 * Read operations check cache first, fall back to DB on miss.
 *
 * Status lifecycle:
 *   - activate:   inactive → active
 *   - deactivate: active → inactive
 *   - revoke:     active|inactive → revoked (permanent, cannot be undone)
 *
 * The findForOidc() function maps internal Client objects to oidc-provider
 * metadata format, used by the adapter factory during OIDC operations.
 */

import type {
  Client,
  ClientWithSecret,
  CreateClientInput,
  UpdateClientInput,
  ListClientsOptions,
  PaginatedResult,
} from './types.js';
import {
  insertClient,
  findClientById,
  findClientByClientId,
  updateClient as repoUpdateClient,
  listClients as repoListClients,
} from './repository.js';
import { getLatestActiveSha256 } from './secret-repository.js';
import {
  getCachedClientByClientId,
  getCachedClientById,
  cacheClient,
  invalidateClientCache,
} from './cache.js';
import { generateClientId } from './crypto.js';
import {
  validateRedirectUris,
  getDefaultGrantTypes,
  getDefaultTokenEndpointAuthMethod,
  getDefaultResponseTypes,
  getDefaultScope,
} from './validators.js';
import { verify } from './secret-service.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { ClientNotFoundError, ClientValidationError } from './errors.js';
import { getApplicationById } from '../applications/service.js';
import { getOrganizationById } from '../organizations/service.js';

// ===========================================================================
// Client CRUD
// ===========================================================================

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new OIDC client.
 *
 * Flow:
 * 1. Validate organization exists and is active
 * 2. Validate application exists and is active
 * 3. Validate redirect URIs
 * 4. Apply defaults (grant types, response types, scope, auth method, PKCE)
 * 5. Generate cryptographically random client_id
 * 6. Insert client row
 * 7. Cache the client
 * 8. Write audit log
 * 9. Return ClientWithSecret (secret is null for public clients;
 *    for confidential clients, the caller must generate the initial
 *    secret separately via the secret service)
 *
 * @param input - Client creation data
 * @param actorId - UUID of the user performing the action (for audit)
 * @returns Created client wrapped in ClientWithSecret (secret always null here)
 * @throws ClientValidationError if org/app invalid or URIs fail validation
 */
export async function createClient(
  input: CreateClientInput,
  actorId?: string,
): Promise<ClientWithSecret> {
  // Validate organization exists and is active
  const org = await getOrganizationById(input.organizationId);
  if (!org) {
    throw new ClientValidationError('Organization not found');
  }
  if (org.status !== 'active') {
    throw new ClientValidationError('Organization is not active');
  }

  // Validate application exists and is active
  const app = await getApplicationById(input.applicationId);
  if (!app) {
    throw new ClientValidationError('Application not found');
  }
  if (app.status !== 'active') {
    throw new ClientValidationError('Application is not active');
  }

  // Validate redirect URIs
  // Use non-production mode for validation (production mode enforcement
  // is done at the API layer based on environment config)
  const uriValidation = validateRedirectUris(input.redirectUris, false);
  if (!uriValidation.isValid) {
    throw new ClientValidationError(
      `Invalid redirect URIs: ${uriValidation.errors!.join('; ')}`,
    );
  }

  // Apply defaults for optional fields
  const grantTypes = input.grantTypes ??
    getDefaultGrantTypes(input.clientType, input.applicationType);
  const responseTypes = input.responseTypes ?? getDefaultResponseTypes();
  const scope = input.scope ?? getDefaultScope();
  const tokenEndpointAuthMethod = input.tokenEndpointAuthMethod ??
    getDefaultTokenEndpointAuthMethod(input.clientType);
  const requirePkce = input.requirePkce ?? true;

  // Generate a unique OIDC client_id
  const clientId = generateClientId();

  // Insert into database
  const client = await insertClient({
    organizationId: input.organizationId,
    applicationId: input.applicationId,
    clientId,
    clientName: input.clientName,
    clientType: input.clientType,
    applicationType: input.applicationType,
    redirectUris: input.redirectUris,
    postLogoutRedirectUris: input.postLogoutRedirectUris ?? [],
    grantTypes,
    responseTypes,
    scope,
    tokenEndpointAuthMethod,
    allowedOrigins: input.allowedOrigins ?? [],
    requirePkce,
  });

  // Cache the new client
  await cacheClient(client);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    organizationId: input.organizationId,
    eventType: 'client.created',
    eventCategory: 'admin',
    actorId,
    metadata: {
      clientDbId: client.id,
      clientId: client.clientId,
      clientName: client.clientName,
      clientType: client.clientType,
      applicationType: client.applicationType,
      applicationId: input.applicationId,
    },
  });

  // Return without secret — caller must use secret service for confidential clients
  return { client, secret: null };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Find a client by internal UUID.
 * Checks Redis cache first, falls back to database on miss.
 *
 * @param id - Client internal UUID
 * @returns Client or null if not found
 */
export async function getClientById(id: string): Promise<Client | null> {
  // Try cache first
  const cached = await getCachedClientById(id);
  if (cached) return cached;

  // Fall back to database
  const client = await findClientById(id);
  if (client) {
    await cacheClient(client);
  }
  return client;
}

/**
 * Find a client by OIDC client_id.
 * Checks Redis cache first, falls back to database on miss.
 *
 * @param clientId - OIDC client_id (public identifier)
 * @returns Client or null if not found
 */
export async function getClientByClientId(clientId: string): Promise<Client | null> {
  // Try cache first
  const cached = await getCachedClientByClientId(clientId);
  if (cached) return cached;

  // Fall back to database
  const client = await findClientByClientId(clientId);
  if (client) {
    await cacheClient(client);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update a client's configurable fields.
 *
 * Validates redirect URIs if they are being changed.
 *
 * @param id - Client internal UUID
 * @param input - Fields to update
 * @param actorId - UUID of the user performing the action
 * @returns Updated client
 * @throws ClientNotFoundError if client not found
 * @throws ClientValidationError if redirect URIs are invalid
 */
export async function updateClient(
  id: string,
  input: UpdateClientInput,
  actorId?: string,
): Promise<Client> {
  // Validate redirect URIs if provided
  if (input.redirectUris) {
    const uriValidation = validateRedirectUris(input.redirectUris, false);
    if (!uriValidation.isValid) {
      throw new ClientValidationError(
        `Invalid redirect URIs: ${uriValidation.errors!.join('; ')}`,
      );
    }
  }

  // Build update data from input
  const updateData: Record<string, unknown> = {};
  if (input.clientName !== undefined) updateData.clientName = input.clientName;
  if (input.redirectUris !== undefined) updateData.redirectUris = input.redirectUris;
  if (input.postLogoutRedirectUris !== undefined) updateData.postLogoutRedirectUris = input.postLogoutRedirectUris;
  if (input.grantTypes !== undefined) updateData.grantTypes = input.grantTypes;
  if (input.responseTypes !== undefined) updateData.responseTypes = input.responseTypes;
  if (input.scope !== undefined) updateData.scope = input.scope;
  if (input.tokenEndpointAuthMethod !== undefined) updateData.tokenEndpointAuthMethod = input.tokenEndpointAuthMethod;
  if (input.allowedOrigins !== undefined) updateData.allowedOrigins = input.allowedOrigins;
  if (input.requirePkce !== undefined) updateData.requirePkce = input.requirePkce;

  let client: Client;
  try {
    client = await repoUpdateClient(id, updateData);
  } catch (err) {
    if (err instanceof Error && err.message === 'Client not found') {
      throw new ClientNotFoundError(id);
    }
    throw err;
  }

  // Invalidate old cache and re-cache the updated version
  await invalidateClientCache(client.clientId, client.id);
  await cacheClient(client);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    organizationId: client.organizationId,
    eventType: 'client.updated',
    eventCategory: 'admin',
    actorId,
    metadata: {
      clientDbId: client.id,
      clientId: client.clientId,
      fields: Object.keys(updateData),
    },
  });

  return client;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List clients by organization with pagination.
 *
 * @param organizationId - Organization UUID
 * @param options - Pagination and sort options
 * @returns Paginated result
 */
export async function listClientsByOrganization(
  organizationId: string,
  options: Omit<ListClientsOptions, 'organizationId'>,
): Promise<PaginatedResult<Client>> {
  return repoListClients({ ...options, organizationId });
}

/**
 * List clients by application with pagination.
 *
 * @param applicationId - Application UUID
 * @param options - Pagination and sort options
 * @returns Paginated result
 */
export async function listClientsByApplication(
  applicationId: string,
  options: Omit<ListClientsOptions, 'applicationId'>,
): Promise<PaginatedResult<Client>> {
  return repoListClients({ ...options, applicationId });
}

// ===========================================================================
// Status lifecycle
// ===========================================================================

/**
 * Load and validate a client exists before a status change.
 * @throws ClientNotFoundError if not found
 */
async function loadClientForStatusChange(id: string): Promise<Client> {
  const client = await findClientById(id);
  if (!client) throw new ClientNotFoundError(id);
  return client;
}

/**
 * Deactivate a client (active → inactive).
 *
 * @param id - Client internal UUID
 * @param actorId - UUID of the user performing the action
 * @throws ClientNotFoundError if not found
 * @throws ClientValidationError if not currently active
 */
export async function deactivateClient(
  id: string,
  actorId?: string,
): Promise<void> {
  const client = await loadClientForStatusChange(id);

  if (client.status !== 'active') {
    throw new ClientValidationError(
      `Cannot deactivate client from status: ${client.status}`,
    );
  }

  await repoUpdateClient(id, { status: 'inactive' });
  await invalidateClientCache(client.clientId, client.id);

  await writeAuditLog({
    organizationId: client.organizationId,
    eventType: 'client.deactivated',
    eventCategory: 'admin',
    actorId,
    metadata: { clientDbId: client.id, clientId: client.clientId },
  });
}

/**
 * Activate a client (inactive → active).
 *
 * @param id - Client internal UUID
 * @param actorId - UUID of the user performing the action
 * @throws ClientNotFoundError if not found
 * @throws ClientValidationError if not currently inactive
 */
export async function activateClient(
  id: string,
  actorId?: string,
): Promise<void> {
  const client = await loadClientForStatusChange(id);

  if (client.status !== 'inactive') {
    throw new ClientValidationError(
      `Cannot activate client from status: ${client.status}`,
    );
  }

  await repoUpdateClient(id, { status: 'active' });
  await invalidateClientCache(client.clientId, client.id);

  await writeAuditLog({
    organizationId: client.organizationId,
    eventType: 'client.activated',
    eventCategory: 'admin',
    actorId,
    metadata: { clientDbId: client.id, clientId: client.clientId },
  });
}

/**
 * Revoke a client (active or inactive → revoked).
 *
 * Revocation is permanent — revoked clients cannot be reactivated.
 * This effectively disables the client for all OIDC operations.
 *
 * @param id - Client internal UUID
 * @param actorId - UUID of the user performing the action
 * @throws ClientNotFoundError if not found
 * @throws ClientValidationError if already revoked
 */
export async function revokeClient(
  id: string,
  actorId?: string,
): Promise<void> {
  const client = await loadClientForStatusChange(id);

  if (client.status === 'revoked') {
    throw new ClientValidationError('Client is already revoked');
  }

  await repoUpdateClient(id, { status: 'revoked' });
  await invalidateClientCache(client.clientId, client.id);

  await writeAuditLog({
    organizationId: client.organizationId,
    eventType: 'client.revoked',
    eventCategory: 'admin',
    actorId,
    metadata: {
      clientDbId: client.id,
      clientId: client.clientId,
      previousStatus: client.status,
    },
  });
}

// ===========================================================================
// OIDC integration
// ===========================================================================

/**
 * Find a client by OIDC client_id and return oidc-provider metadata format.
 *
 * This function is the bridge between Porta's internal client model and
 * the metadata shape expected by node-oidc-provider. It's called by the
 * adapter factory during OIDC flows (authorization, token exchange, etc.).
 *
 * Returns undefined (not null) for compatibility with oidc-provider which
 * expects undefined for "client not found".
 *
 * @param clientId - OIDC client_id
 * @returns OIDC client metadata object, or undefined if not found/inactive
 */
export async function findForOidc(
  clientId: string,
): Promise<Record<string, unknown> | undefined> {
  const client = await getClientByClientId(clientId);

  // Client must exist and be active for OIDC operations
  if (!client || client.status !== 'active') {
    return undefined;
  }

  // Build base oidc-provider metadata
  const metadata: Record<string, unknown> = {
    client_id: client.clientId,
    client_name: client.clientName,
    application_type: client.applicationType,
    redirect_uris: client.redirectUris,
    post_logout_redirect_uris: client.postLogoutRedirectUris,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    scope: client.scope,
    token_endpoint_auth_method: client.clientType === 'public'
      ? 'none'
      : client.tokenEndpointAuthMethod,
    // Porta uses ES256 signing keys — must declare this explicitly
    // or oidc-provider defaults to RS256 and rejects the client.
    id_token_signed_response_alg: 'ES256',
    // allowed_origins needed for CORS checks on OIDC endpoints
    'urn:porta:allowed_origins': client.allowedOrigins,
    // Client type for internal use
    'urn:porta:client_type': client.clientType,
    // Organization ID — used by auto-consent logic in showConsent() to
    // identify first-party clients (same org → skip consent screen)
    organizationId: client.organizationId,
  };

  // For confidential clients, include the SHA-256 hash as client_secret.
  // oidc-provider will compare this against the SHA-256 of the presented
  // secret (pre-hashed by the client-secret-hash middleware).
  if (client.clientType === 'confidential') {
    const sha256Hash = await getLatestActiveSha256(client.id);
    if (sha256Hash) {
      metadata.client_secret = sha256Hash;
    }
  }

  return metadata;
}

/**
 * Verify a client secret for OIDC authentication.
 *
 * Convenience wrapper around secret-service.verify() that resolves the
 * internal DB id from the OIDC client_id and performs guard checks:
 * - Client must exist and be active
 * - Client must be confidential (public clients have no secrets)
 *
 * Used during token endpoint authentication via the admin API.
 *
 * @param clientId - The OIDC client_id (external identifier)
 * @param plaintext - The presented secret to verify
 * @returns true if secret matches any active hash, false otherwise
 */
export async function verifyClientSecret(
  clientId: string,
  plaintext: string,
): Promise<boolean> {
  const client = await getClientByClientId(clientId);

  // Client must exist and be active
  if (!client || client.status !== 'active') return false;

  // Public clients should not have secrets — reject verification attempts
  if (client.clientType === 'public') return false;

  // Delegate to secret-service which checks all active, non-expired hashes
  return verify(client.id, plaintext);
}
