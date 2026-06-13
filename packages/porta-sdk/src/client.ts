/**
 * PortaClient factory — creates a client instance with all 19 domain namespaces.
 *
 * @module client
 */

import type { HttpTransport } from './transport/types.js';
import {
  createOrganizationsDomain,
  createApplicationsDomain,
  createClientsDomain,
  createUsersDomain,
  createStandaloneUsersDomain,
  createRolesDomain,

  createPermissionsDomain,
  createCustomClaimsDomain,
  createUserRolesDomain,
  createUserClaimsDomain,
  createConfigDomain,
  createKeysDomain,
  createAuditDomain,
  createStatsDomain,
  createSessionsDomain,
  createBulkDomain,
  createBrandingDomain,
  createExportsDomain,
  createTwoFactorDomain,
  createImportsDomain,
} from './domains/index.js';
import type {
  OrganizationsDomain,
  ApplicationsDomain,
  ClientsDomain,
  UsersDomain,
  StandaloneUsersDomain,
  RolesDomain,

  PermissionsDomain,
  CustomClaimsDomain,
  UserRolesDomain,
  UserClaimsDomain,
  ConfigDomain,
  KeysDomain,
  AuditDomain,
  StatsDomain,
  SessionsDomain,
  BulkDomain,
  BrandingDomain,
  ExportsDomain,
  TwoFactorDomain,
  ImportsDomain,
} from './domains/index.js';

// ---------------------------------------------------------------------------
// Options & Interface
// ---------------------------------------------------------------------------

export interface PortaClientOptions {
  /** Pre-configured HTTP transport (from createNodeTransport or createBrowserTransport) */
  transport: HttpTransport;
}

export interface PortaClient {
  organizations: OrganizationsDomain;
  applications: ApplicationsDomain;
  clients: ClientsDomain;
  users: UsersDomain;
  /** Org-less user operations (Admin GUI SPA) — maps to /api/admin/users/:userId */
  usersById: StandaloneUsersDomain;
  userRoles: UserRolesDomain;

  userClaims: UserClaimsDomain;
  roles: RolesDomain;
  permissions: PermissionsDomain;
  customClaims: CustomClaimsDomain;
  config: ConfigDomain;
  keys: KeysDomain;
  audit: AuditDomain;
  stats: StatsDomain;
  sessions: SessionsDomain;
  bulk: BulkDomain;
  branding: BrandingDomain;
  exports: ExportsDomain;
  twoFactor: TwoFactorDomain;
  imports: ImportsDomain;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a fully-configured Porta SDK client with all domain namespaces.
 *
 * @example
 * ```typescript
 * import { createPortaClient } from '@portaidentity/sdk';
 * import { createNodeTransport } from '@portaidentity/sdk/node';
 * import { createTokenAuth } from '@portaidentity/sdk/node';
 *
 * const transport = createNodeTransport({
 *   baseUrl: 'https://porta.local:3443/api/admin',
 *   auth: createTokenAuth('my-bearer-token'),
 * });
 *
 * const porta = createPortaClient({ transport });
 * const orgs = await porta.organizations.list();
 * ```
 */
export function createPortaClient(options: PortaClientOptions): PortaClient {
  const { transport } = options;

  return {
    organizations: createOrganizationsDomain(transport),
    applications: createApplicationsDomain(transport),
    clients: createClientsDomain(transport),
    users: createUsersDomain(transport),
    usersById: createStandaloneUsersDomain(transport),
    userRoles: createUserRolesDomain(transport),

    userClaims: createUserClaimsDomain(transport),
    roles: createRolesDomain(transport),
    permissions: createPermissionsDomain(transport),
    customClaims: createCustomClaimsDomain(transport),
    config: createConfigDomain(transport),
    keys: createKeysDomain(transport),
    audit: createAuditDomain(transport),
    stats: createStatsDomain(transport),
    sessions: createSessionsDomain(transport),
    bulk: createBulkDomain(transport),
    branding: createBrandingDomain(transport),
    exports: createExportsDomain(transport),
    twoFactor: createTwoFactorDomain(transport),
    imports: createImportsDomain(transport),
  };
}
