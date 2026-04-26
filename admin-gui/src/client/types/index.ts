/**
 * Frontend-specific types for the admin GUI React SPA.
 * Re-exports shared types and defines all Porta entity types
 * matching the admin API response shapes.
 */

// Re-export shared types used by the client
export type {
  AdminUser,
  SessionInfo,
  EnvironmentInfo,
  HealthStatus,
  PaginatedResponse,
  PaginationInfo,
  PaginationState,
  ListParams,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Generic API types
// ---------------------------------------------------------------------------

/** Generic API error response body */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Organization entity
// ---------------------------------------------------------------------------

/** Two-factor authentication policy for an organization */
export type TwoFactorPolicy = 'disabled' | 'optional' | 'required';

/** Supported login methods */
export type LoginMethod = 'password' | 'magic_link';

/** Organization status lifecycle states */
export type OrganizationStatus = 'active' | 'suspended' | 'archived';

/** Organization entity matching Porta admin API response */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  isSuperAdmin: boolean;
  brandingLogoUrl: string | null;
  brandingFaviconUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingCompanyName: string | null;
  brandingCustomCss: string | null;
  defaultLocale: string;
  twoFactorPolicy: TwoFactorPolicy;
  defaultLoginMethods: LoginMethod[];
  createdAt: string;
  updatedAt: string;
}

/** Request body for creating an organization */
export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  defaultLocale?: string;
  defaultLoginMethods?: LoginMethod[];
}

/** Request body for updating an organization */
export interface UpdateOrganizationRequest {
  name?: string;
  defaultLocale?: string;
  twoFactorPolicy?: TwoFactorPolicy;
  defaultLoginMethods?: LoginMethod[];
}

// ---------------------------------------------------------------------------
// Application entity
// ---------------------------------------------------------------------------

/** Application status lifecycle states */
export type ApplicationStatus = 'active' | 'archived';

/** Application module types */
export type ModuleType = string;

/** Application module within an application */
export interface ApplicationModule {
  id: string;
  applicationId: string;
  moduleType: ModuleType;
  createdAt: string;
}

/** Application entity matching Porta admin API response */
export interface Application {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  modules?: ApplicationModule[];
}

/** Request body for creating an application */
export interface CreateApplicationRequest {
  name: string;
  slug?: string;
  description?: string;
  organizationId: string;
}

/** Request body for updating an application */
export interface UpdateApplicationRequest {
  name?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Client entity
// ---------------------------------------------------------------------------

/** Client status lifecycle states */
export type ClientStatus = 'active' | 'revoked';

/** OIDC grant types */
export type GrantType =
  | 'authorization_code'
  | 'client_credentials'
  | 'refresh_token';

/** OIDC response types */
export type ResponseType = 'code';

/** OIDC token endpoint authentication methods */
export type TokenEndpointAuthMethod =
  | 'none'
  | 'client_secret_post'
  | 'client_secret_basic';

/** Client entity matching Porta admin API response */
export interface Client {
  id: string;
  applicationId: string;
  clientId: string;
  name: string;
  description: string | null;
  status: ClientStatus;
  isConfidential: boolean;
  grantTypes: GrantType[];
  responseTypes: ResponseType[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  loginMethods: LoginMethod[] | null;
  createdAt: string;
  updatedAt: string;
}

/** Request body for creating a client */
export interface CreateClientRequest {
  name: string;
  applicationId: string;
  isConfidential?: boolean;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: GrantType[];
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
}

/** Request body for updating a client */
export interface UpdateClientRequest {
  name?: string;
  description?: string;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: GrantType[];
  loginMethods?: LoginMethod[] | null;
}

/** Client secret (returned only on generation — plaintext never stored) */
export interface ClientSecret {
  id: string;
  clientId: string;
  label: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Only present in the generate response */
  plaintext?: string;
}

// ---------------------------------------------------------------------------
// User entity
// ---------------------------------------------------------------------------

/** User status lifecycle states */
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'locked';

/** User entity matching Porta admin API response */
export interface User {
  id: string;
  organizationId: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  passwordChangedAt: string | null;
  givenName: string | null;
  familyName: string | null;
  middleName: string | null;
  nickname: string | null;
  preferredUsername: string | null;
  profileUrl: string | null;
  pictureUrl: string | null;
  websiteUrl: string | null;
  gender: string | null;
  birthdate: string | null;
  zoneinfo: string | null;
  locale: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  addressStreet: string | null;
  addressLocality: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  failedLoginCount: number;
  twoFactorEnabled: boolean;
  twoFactorMethod: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Request body for creating a user */
export interface CreateUserRequest {
  email: string;
  organizationId: string;
  givenName?: string;
  familyName?: string;
  password?: string;
}

/** Request body for updating a user */
export interface UpdateUserRequest {
  givenName?: string;
  familyName?: string;
  middleName?: string;
  nickname?: string;
  preferredUsername?: string;
  profileUrl?: string;
  pictureUrl?: string;
  websiteUrl?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  phoneNumber?: string;
  addressStreet?: string;
  addressLocality?: string;
  addressRegion?: string;
  addressPostalCode?: string;
  addressCountry?: string;
}

// ---------------------------------------------------------------------------
// RBAC entities
// ---------------------------------------------------------------------------

/** Role entity */
export interface Role {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Permission entity */
export interface Permission {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Role-permission mapping */
export interface RolePermissionMapping {
  roleId: string;
  permissionId: string;
  createdAt: string;
}

/** User-role assignment */
export interface UserRoleAssignment {
  userId: string;
  roleId: string;
  organizationId: string;
  createdAt: string;
}

/** Request body for creating a role */
export interface CreateRoleRequest {
  name: string;
  slug?: string;
  description?: string;
}

/** Request body for creating a permission */
export interface CreatePermissionRequest {
  name: string;
  slug?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Custom Claims entities
// ---------------------------------------------------------------------------

/** Claim value type */
export type ClaimValueType = 'string' | 'number' | 'boolean' | 'json';

/** Claim definition for an application */
export interface ClaimDefinition {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  valueType: ClaimValueType;
  isRequired: boolean;
  defaultValue: unknown | null;
  validationRules: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** User claim value */
export interface UserClaimValue {
  id: string;
  userId: string;
  claimDefinitionId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

/** Request body for creating a claim definition */
export interface CreateClaimDefinitionRequest {
  name: string;
  slug?: string;
  description?: string;
  valueType: ClaimValueType;
  isRequired?: boolean;
  defaultValue?: unknown;
  validationRules?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Session entity
// ---------------------------------------------------------------------------

/** Admin session entry */
export interface AdminSession {
  id: string;
  userId: string;
  userEmail: string;
  organizationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActivityAt: string;
  expiresAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Audit log entity
// ---------------------------------------------------------------------------

/** Audit log entry — matches the backend GET /api/admin/audit response shape */
export interface AuditEntry {
  id: string;
  eventType: string;
  eventCategory: string;
  actorId: string | null;
  organizationId: string | null;
  userId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// System configuration
// ---------------------------------------------------------------------------

/** System configuration key-value entry */
export interface SystemConfig {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Signing key entity
// ---------------------------------------------------------------------------

/** Signing key status */
export type SigningKeyStatus = 'active' | 'rotated' | 'revoked';

/** ES256 signing key */
export interface SigningKey {
  id: string;
  kid: string;
  algorithm: string;
  status: SigningKeyStatus;
  activatedAt: string | null;
  rotatedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Dashboard statistics
// ---------------------------------------------------------------------------

/** Login activity counts for a time window */
export interface LoginActivityWindow {
  successful: number;
  failed: number;
}

/** Dashboard stats overview response */
export interface StatsOverview {
  organizations: Record<string, number> & { total: number };
  users: Record<string, number> & {
    total: number;
    newLast7d: number;
    newLast30d: number;
    activeLast30d: number;
  };
  applications: Record<string, number> & { total: number };
  clients: Record<string, number> & { total: number };
  loginActivity: {
    last24h: LoginActivityWindow;
    last7d: LoginActivityWindow;
    last30d: LoginActivityWindow;
  };
  systemHealth: {
    database: boolean;
    redis: boolean;
  };
  generatedAt: string;
}

/** Organization-scoped stats */
export interface OrgStats {
  organizationId: string;
  users: Record<string, number> & {
    total: number;
    newLast7d: number;
    newLast30d: number;
    activeLast30d: number;
  };
  clients: Record<string, number> & { total: number };
  loginActivity: {
    last24h: LoginActivityWindow;
    last7d: LoginActivityWindow;
    last30d: LoginActivityWindow;
  };
}

// ---------------------------------------------------------------------------
// Navigation types (used by sidebar)
// ---------------------------------------------------------------------------

/** Navigation item for the sidebar */
export interface NavItem {
  /** Unique key identifying this nav item */
  key: string;
  /** Display label */
  label: string;
  /** Route path */
  path: string;
  /** FluentUI icon (regular variant) */
  icon: React.ComponentType;
  /** FluentUI icon (filled variant, for active state) */
  iconFilled: React.ComponentType;
  /** Whether this item requires specific roles */
  requiredRoles?: string[];
  /** Child navigation items (for sub-menus) */
  children?: NavItem[];
}
