/**
 * Client types, interfaces, and row mapping functions.
 *
 * Defines the shape of OIDC client registrations and their secrets.
 * Clients are scoped to an organization + application pair and represent
 * deployment targets (web, mobile, SPA).
 *
 * Row mapping functions convert snake_case DB rows to camelCase domain
 * objects. Array columns (TEXT[]) from PostgreSQL are handled directly —
 * pg returns them as JavaScript arrays.
 */

// ===========================================================================
// Enums / Literal types
// ===========================================================================

/** Client type — confidential (has secret) or public (no secret) */
export type ClientType = 'confidential' | 'public';

/** Application type — how the client is deployed */
export type ApplicationType = 'web' | 'native' | 'spa';

/** Client status values */
export type ClientStatus = 'active' | 'inactive' | 'revoked';

/** Secret status values */
export type SecretStatus = 'active' | 'revoked';

/**
 * Supported login methods.
 *
 * This is an extensible union — future methods (e.g., `'sso'`, `'passkey'`)
 * can be added here. The set of currently valid values is mirrored in
 * {@link LOGIN_METHODS} for runtime validation.
 */
export type LoginMethod = 'password' | 'magic_link';

/**
 * Runtime list of all currently valid {@link LoginMethod} values.
 *
 * Used by validation helpers in the organizations / clients service layers
 * and by the CLI flag parser to validate user-supplied input.
 */
export const LOGIN_METHODS: readonly LoginMethod[] = [
  'password',
  'magic_link',
] as const;


// ===========================================================================
// Domain interfaces
// ===========================================================================

/** Full client record (camelCase) */
export interface Client {
  id: string;
  organizationId: string;
  applicationId: string;
  clientId: string;
  clientName: string;
  clientType: ClientType;
  applicationType: ApplicationType;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
  tokenEndpointAuthMethod: string;
  allowedOrigins: string[];
  requirePkce: boolean;
  status: ClientStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Client secret record (camelCase) — secret_hash is NEVER exposed via this type */
export interface ClientSecret {
  id: string;
  clientId: string;
  label: string | null;
  expiresAt: Date | null;
  status: SecretStatus;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** Returned only once at secret creation time */
export interface SecretWithPlaintext {
  id: string;
  clientId: string;
  label: string | null;
  plaintext: string;
  expiresAt: Date | null;
  createdAt: Date;
}

/** Returned when creating a confidential client */
export interface ClientWithSecret {
  client: Client;
  secret: SecretWithPlaintext | null;
}

// ===========================================================================
// Input types
// ===========================================================================

/** Input for creating a new client */
export interface CreateClientInput {
  organizationId: string;
  applicationId: string;
  clientName: string;
  clientType: ClientType;
  applicationType: ApplicationType;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  scope?: string;
  tokenEndpointAuthMethod?: string;
  allowedOrigins?: string[];
  requirePkce?: boolean;
  secretLabel?: string;
}

/** Input for updating a client (partial) */
export interface UpdateClientInput {
  clientName?: string;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  scope?: string;
  tokenEndpointAuthMethod?: string;
  allowedOrigins?: string[];
  requirePkce?: boolean;
}

/** Input for creating a secret */
export interface CreateSecretInput {
  label?: string;
  expiresAt?: Date;
}

/** Options for listing clients */
export interface ListClientsOptions {
  page: number;
  pageSize: number;
  organizationId?: string;
  applicationId?: string;
  status?: ClientStatus;
  search?: string;
  sortBy?: 'client_name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

/** Paginated result (reusable generic) */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ===========================================================================
// Database row types (snake_case)
// ===========================================================================

/** Raw row from the clients table */
export interface ClientRow {
  id: string;
  organization_id: string;
  application_id: string;
  client_id: string;
  client_name: string;
  client_type: string;
  application_type: string;
  redirect_uris: string[];
  post_logout_redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string;
  token_endpoint_auth_method: string;
  allowed_origins: string[];
  require_pkce: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/** Raw row from the client_secrets table */
export interface ClientSecretRow {
  id: string;
  client_id: string;
  secret_hash: string;
  label: string | null;
  expires_at: Date | null;
  status: string;
  last_used_at: Date | null;
  created_at: Date;
}

// ===========================================================================
// Row mapping functions
// ===========================================================================

/**
 * Map a snake_case client row to a camelCase Client object.
 *
 * Array columns (redirect_uris, grant_types, etc.) are returned as
 * JavaScript arrays by the pg driver — no parsing needed.
 */
export function mapRowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    organizationId: row.organization_id,
    applicationId: row.application_id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientType: row.client_type as ClientType,
    applicationType: row.application_type as ApplicationType,
    redirectUris: row.redirect_uris ?? [],
    postLogoutRedirectUris: row.post_logout_redirect_uris ?? [],
    grantTypes: row.grant_types ?? [],
    responseTypes: row.response_types ?? [],
    scope: row.scope,
    tokenEndpointAuthMethod: row.token_endpoint_auth_method,
    allowedOrigins: row.allowed_origins ?? [],
    requirePkce: row.require_pkce,
    status: row.status as ClientStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a snake_case client_secrets row to a camelCase ClientSecret object.
 *
 * IMPORTANT: The secret_hash field is intentionally excluded from the
 * mapped output. Secret hashes should never leave the repository layer.
 */
export function mapRowToClientSecret(row: ClientSecretRow): ClientSecret {
  return {
    id: row.id,
    clientId: row.client_id,
    label: row.label,
    expiresAt: row.expires_at,
    status: row.status as SecretStatus,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}
