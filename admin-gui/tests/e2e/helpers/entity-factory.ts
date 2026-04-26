/**
 * Entity factory helpers for Admin GUI E2E tests.
 *
 * Creates and deletes test entities via the BFF API proxy, bypassing
 * the UI for test setup/teardown. This ensures tests start with a
 * known state without relying on UI forms (which may have bugs).
 *
 * All functions use Playwright's APIRequestContext to make HTTP calls
 * directly to the BFF, sharing the same authenticated session.
 *
 * @see plans/admin-gui-testing/03-test-infrastructure.md
 */

import type { APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal organization response from the admin API */
export interface CreatedOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/** Minimal application response from the admin API */
export interface CreatedApplication {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  status: string;
}

/** Minimal client response from the admin API */
export interface CreatedClient {
  id: string;
  clientId: string;
  clientName: string;
  clientType: string;
}

/** Minimal user response from the admin API */
export interface CreatedUser {
  id: string;
  email: string;
  givenName: string;
  familyName: string;
  status: string;
}

/** Minimal role response from the admin API */
export interface CreatedRole {
  id: string;
  name: string;
  slug: string;
}

/** Minimal permission response from the admin API */
export interface CreatedPermission {
  id: string;
  name: string;
  slug: string;
}

/** Minimal claim definition response from the admin API */
export interface CreatedClaimDefinition {
  id: string;
  claimName: string;
  claimType: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** BFF base URL — matches Playwright config and global-setup */
const BFF_BASE_URL = process.env.ADMIN_GUI_URL ?? 'http://localhost:49301';

/** Cached CSRF token — fetched once per test run from /auth/me */
let cachedCsrfToken: string | null = null;

/**
 * Get a valid CSRF token from the BFF session.
 * The BFF exposes the CSRF token in the GET /auth/me response.
 * We cache it since all requests share the same session.
 */
export async function getCsrfToken(request: APIRequestContext): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  const response = await request.get(`${BFF_BASE_URL}/auth/me`);
  if (!response.ok()) {
    throw new Error(`Failed to fetch /auth/me for CSRF token: ${response.status()}`);
  }
  const body = await response.json();
  cachedCsrfToken = body.csrfToken;
  if (!cachedCsrfToken) {
    throw new Error('No csrfToken in /auth/me response');
  }
  return cachedCsrfToken;
}

// ---------------------------------------------------------------------------
// Organization factories
// ---------------------------------------------------------------------------

/**
 * Create a test organization via the BFF API proxy.
 *
 * @param request - Playwright API request context (authenticated)
 * @param name - Organization name (should be unique per test)
 * @param options - Optional additional fields
 * @returns The created organization
 */
export async function createTestOrg(
  request: APIRequestContext,
  name: string,
  options?: {
    defaultLocale?: string;
    defaultLoginMethods?: string[];
  },
): Promise<CreatedOrganization> {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post(`${BFF_BASE_URL}/api/organizations`, {
    headers: { 'X-CSRF-Token': csrfToken },
    data: {
      name,
      ...options,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test org "${name}": ${response.status()} ${body}`,
    );
  }

  const data = await response.json();
  return data.data ?? data;
}

/**
 * Delete a test organization by ID via the BFF API proxy.
 * Used for cleanup after tests that create temporary entities.
 *
 * Note: Not all entities may be deletable — archive may be the
 * only available "removal" action. This function attempts deletion
 * but swallows errors silently.
 *
 * @param request - Playwright API request context (authenticated)
 * @param id - Organization UUID to delete/archive
 */
export async function deleteTestOrg(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  // Try archiving first (Porta doesn't support hard delete of orgs)
  const csrfToken = await getCsrfToken(request);
  await request.post(`${BFF_BASE_URL}/api/organizations/${id}/archive`, {
    headers: { 'X-CSRF-Token': csrfToken },
  }).catch(() => {
    // Ignore errors — org may already be archived
  });
}

// ---------------------------------------------------------------------------
// Application factories
// ---------------------------------------------------------------------------

/**
 * Create a test application via the BFF API proxy.
 *
 * @param request - Playwright API request context (authenticated)
 * @param orgId - Organization UUID to create the app in
 * @param name - Application name
 * @param options - Optional additional fields
 * @returns The created application
 */
export async function createTestApp(
  request: APIRequestContext,
  orgId: string,
  name: string,
  options?: {
    description?: string;
  },
): Promise<CreatedApplication> {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post(`${BFF_BASE_URL}/api/applications`, {
    headers: { 'X-CSRF-Token': csrfToken },
    data: {
      name,
      organizationId: orgId,
      ...options,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test app "${name}": ${response.status()} ${body}`,
    );
  }

  const data = await response.json();
  return data.data ?? data;
}

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

/**
 * Create a test OIDC client via the BFF API proxy.
 *
 * @param request - Playwright API request context (authenticated)
 * @param appId - Application UUID to create the client in
 * @param name - Client name
 * @param options - Optional client configuration
 * @returns The created client
 */
export async function createTestClient(
  request: APIRequestContext,
  appId: string,
  name: string,
  options?: {
    clientType?: 'public' | 'confidential';
    redirectUris?: string[];
    grantTypes?: string[];
  },
): Promise<CreatedClient> {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post(`${BFF_BASE_URL}/api/clients`, {
    headers: { 'X-CSRF-Token': csrfToken },
    data: {
      clientName: name,
      applicationId: appId,
      clientType: options?.clientType ?? 'public',
      applicationType: 'web',
      tokenEndpointAuthMethod: options?.clientType === 'confidential' ? 'client_secret_post' : 'none',
      grantTypes: options?.grantTypes ?? ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      redirectUris: options?.redirectUris ?? ['http://localhost:3000/callback'],
      ...options,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test client "${name}": ${response.status()} ${body}`,
    );
  }

  const data = await response.json();
  return data.data ?? data;
}

// ---------------------------------------------------------------------------
// User factories
// ---------------------------------------------------------------------------

/**
 * Create a test user via the BFF API proxy.
 *
 * @param request - Playwright API request context (authenticated)
 * @param orgId - Organization UUID to create the user in
 * @param data - User details
 * @returns The created user
 */
export async function createTestUser(
  request: APIRequestContext,
  orgId: string,
  data: {
    email: string;
    givenName: string;
    familyName: string;
    password?: string;
  },
): Promise<CreatedUser> {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post(
    `${BFF_BASE_URL}/api/organizations/${orgId}/users`,
    { headers: { 'X-CSRF-Token': csrfToken }, data },
  );

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test user "${data.email}": ${response.status()} ${body}`,
    );
  }

  const responseData = await response.json();
  return responseData.data ?? responseData;
}

// ---------------------------------------------------------------------------
// RBAC factories
// ---------------------------------------------------------------------------

/**
 * Create a test role via the BFF API proxy.
 *
 * @param request - Playwright API request context (authenticated)
 * @param appId - Application UUID to scope the role to
 * @param name - Role name
 * @param description - Optional role description
 * @returns The created role
 */
export async function createTestRole(
  request: APIRequestContext,
  appId: string,
  name: string,
  description?: string,
): Promise<CreatedRole> {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post(
    `${BFF_BASE_URL}/api/applications/${appId}/roles`,
    {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { name, description },
    },
  );

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test role "${name}": ${response.status()} ${body}`,
    );
  }

  const data = await response.json();
  return data.data ?? data;
}

/**
 * Create a test permission via the BFF API proxy.
 *
 * @param request - Playwright API request context (authenticated)
 * @param appId - Application UUID to scope the permission to
 * @param name - Permission name
 * @param description - Optional permission description
 * @returns The created permission
 */
export async function createTestPermission(
  request: APIRequestContext,
  appId: string,
  name: string,
  description?: string,
): Promise<CreatedPermission> {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post(
    `${BFF_BASE_URL}/api/applications/${appId}/permissions`,
    {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { name, description },
    },
  );

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test permission "${name}": ${response.status()} ${body}`,
    );
  }

  const data = await response.json();
  return data.data ?? data;
}

// ---------------------------------------------------------------------------
// Custom claims factories
// ---------------------------------------------------------------------------

/**
 * Create a test claim definition via the BFF API proxy.
 *
 * @param request - Playwright API request context (authenticated)
 * @param appId - Application UUID to scope the claim to
 * @param claimName - Claim name
 * @param claimType - Claim value type ('string', 'number', 'boolean')
 * @param options - Optional claim configuration
 * @returns The created claim definition
 */
export async function createTestClaimDefinition(
  request: APIRequestContext,
  appId: string,
  claimName: string,
  claimType: string,
  options?: {
    description?: string;
    includeInIdToken?: boolean;
    includeInAccessToken?: boolean;
    includeInUserinfo?: boolean;
  },
): Promise<CreatedClaimDefinition> {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post(
    `${BFF_BASE_URL}/api/applications/${appId}/claims`,
    {
      headers: { 'X-CSRF-Token': csrfToken },
      data: {
        claimName,
        claimType,
        ...options,
      },
    },
  );

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to create test claim "${claimName}": ${response.status()} ${body}`,
    );
  }

  const data = await response.json();
  return data.data ?? data;
}

// ---------------------------------------------------------------------------
// Utility: Unique name generator
// ---------------------------------------------------------------------------

/**
 * Generate a unique entity name for test isolation.
 * Appends a timestamp suffix to prevent name collisions across test runs.
 *
 * @param prefix - Name prefix (e.g., 'Test Org', 'E2E App')
 * @returns Unique name string
 */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}`;
}
