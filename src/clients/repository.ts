/**
 * Client repository — PostgreSQL data access layer.
 *
 * Provides CRUD operations for the `clients` table using parameterized
 * queries. Each function acquires the pool via `getPool()` and returns
 * mapped Client objects.
 *
 * Key patterns:
 * - Dynamic UPDATE query builder for partial updates
 * - Paginated listing with org/app/status/search filters
 * - Whitelisted sort columns to prevent SQL injection
 * - All rows mapped through `mapRowToClient()`
 * - Array columns (TEXT[]) handled natively by pg driver
 */

import { getPool } from '../lib/database.js';
import type {
  Client,
  ClientRow,
  ListClientsOptions,
  PaginatedResult,
} from './types.js';
import { mapRowToClient } from './types.js';

// ===========================================================================
// Insert
// ===========================================================================

/** Input data for inserting a new client row */
export interface InsertClientData {
  organizationId: string;
  applicationId: string;
  clientId: string;
  clientName: string;
  clientType: string;
  applicationType: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
  tokenEndpointAuthMethod: string;
  allowedOrigins: string[];
  requirePkce: boolean;
}

/**
 * Insert a new client into the database.
 *
 * Uses RETURNING * to get the full row back in a single round trip.
 * The client_id (OIDC identifier) must be unique (enforced by DB constraint).
 *
 * @param data - Client data to insert
 * @returns The newly created client
 * @throws If client_id already exists (unique constraint violation)
 */
export async function insertClient(data: InsertClientData): Promise<Client> {
  const pool = getPool();

  const result = await pool.query<ClientRow>(
    `INSERT INTO clients (
       organization_id, application_id, client_id, client_name,
       client_type, application_type, redirect_uris,
       post_logout_redirect_uris, grant_types, response_types,
       scope, token_endpoint_auth_method, allowed_origins, require_pkce
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      data.organizationId,
      data.applicationId,
      data.clientId,
      data.clientName,
      data.clientType,
      data.applicationType,
      data.redirectUris,
      data.postLogoutRedirectUris,
      data.grantTypes,
      data.responseTypes,
      data.scope,
      data.tokenEndpointAuthMethod,
      data.allowedOrigins,
      data.requirePkce,
    ],
  );

  return mapRowToClient(result.rows[0]);
}

// ===========================================================================
// Find
// ===========================================================================

/**
 * Find a client by its internal UUID.
 *
 * @param id - Client internal UUID
 * @returns Client or null if not found
 */
export async function findClientById(id: string): Promise<Client | null> {
  const pool = getPool();

  const result = await pool.query<ClientRow>(
    'SELECT * FROM clients WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) return null;
  return mapRowToClient(result.rows[0]);
}

/**
 * Find a client by its OIDC client_id (public identifier).
 *
 * @param clientId - OIDC client_id
 * @returns Client or null if not found
 */
export async function findClientByClientId(clientId: string): Promise<Client | null> {
  const pool = getPool();

  const result = await pool.query<ClientRow>(
    'SELECT * FROM clients WHERE client_id = $1',
    [clientId],
  );

  if (result.rows.length === 0) return null;
  return mapRowToClient(result.rows[0]);
}

// ===========================================================================
// Update
// ===========================================================================

/** Fields that can be updated on a client */
export interface UpdateClientData {
  clientName?: string;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  scope?: string;
  tokenEndpointAuthMethod?: string;
  allowedOrigins?: string[];
  requirePkce?: boolean;
  status?: string;
}

/**
 * Mapping from UpdateClientData keys to database column names.
 * Used by the dynamic query builder to construct SET clauses.
 */
const CLIENT_FIELD_TO_COLUMN: Record<string, string> = {
  clientName: 'client_name',
  redirectUris: 'redirect_uris',
  postLogoutRedirectUris: 'post_logout_redirect_uris',
  grantTypes: 'grant_types',
  responseTypes: 'response_types',
  scope: 'scope',
  tokenEndpointAuthMethod: 'token_endpoint_auth_method',
  allowedOrigins: 'allowed_origins',
  requirePkce: 'require_pkce',
  status: 'status',
};

/**
 * Update a client's fields using a dynamic SET clause.
 *
 * Only explicitly provided fields (not undefined) are included in the
 * UPDATE statement. The `updated_at` column is handled by the DB trigger.
 *
 * @param id - Client internal UUID
 * @param data - Fields to update (only non-undefined fields are applied)
 * @returns Updated client
 * @throws Error if client not found or no fields provided
 */
export async function updateClient(
  id: string,
  data: UpdateClientData,
): Promise<Client> {
  const pool = getPool();

  // Build dynamic SET clause from provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [id]; // $1 is always the ID
  let paramIndex = 2;

  for (const [field, column] of Object.entries(CLIENT_FIELD_TO_COLUMN)) {
    const value = data[field as keyof UpdateClientData];
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  const sql = `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query<ClientRow>(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Client not found');
  }

  return mapRowToClient(result.rows[0]);
}

// ===========================================================================
// List
// ===========================================================================

/**
 * Allowed sort columns — whitelisted to prevent SQL injection.
 */
const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  client_name: 'client_name',
  created_at: 'created_at',
};

/**
 * List clients with pagination, filters, and sorting.
 *
 * Supports filtering by organization, application, status, and search text.
 * Executes two queries: COUNT for total, then data with LIMIT/OFFSET.
 *
 * @param options - Pagination, filter, and sort options
 * @returns Paginated result with clients and metadata
 */
export async function listClients(
  options: ListClientsOptions,
): Promise<PaginatedResult<Client>> {
  const pool = getPool();
  const { page, pageSize, organizationId, applicationId, status, search, sortBy, sortOrder } = options;

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (organizationId) {
    conditions.push(`organization_id = $${paramIndex}`);
    params.push(organizationId);
    paramIndex++;
  }

  if (applicationId) {
    conditions.push(`application_id = $${paramIndex}`);
    params.push(applicationId);
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (search) {
    conditions.push(`client_name ILIKE $${paramIndex}`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Whitelist sort column and direction
  const sortColumn = ALLOWED_SORT_COLUMNS[sortBy ?? 'created_at'] ?? 'created_at';
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Count total matching rows
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM clients ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch paginated data
  const offset = (page - 1) * pageSize;
  const dataResult = await pool.query<ClientRow>(
    `SELECT * FROM clients ${whereClause} ORDER BY ${sortColumn} ${direction} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, pageSize, offset],
  );

  return {
    data: dataResult.rows.map(mapRowToClient),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ===========================================================================
// Count helpers
// ===========================================================================

/**
 * Count clients for an organization.
 *
 * @param organizationId - Organization UUID
 * @returns Number of clients
 */
export async function countClientsByOrg(organizationId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM clients WHERE organization_id = $1',
    [organizationId],
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Count clients for an application.
 *
 * @param applicationId - Application UUID
 * @returns Number of clients
 */
export async function countClientsByApp(applicationId: string): Promise<number> {
  const pool = getPool();

  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM clients WHERE application_id = $1',
    [applicationId],
  );

  return parseInt(result.rows[0].count, 10);
}
