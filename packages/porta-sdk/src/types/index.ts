/**
 * Barrel export for all SDK entity types.
 *
 * @module types
 */

// Common types (pagination, ETag, history)
export type {
  ListParams,
  PaginatedResponse,
  ETagResponse,
  HistoryEntry,
} from './common.js';

// Organizations
export type {
  Organization,
  OrganizationStatus,
  TwoFactorPolicy,
  LoginMethod,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  BrandingInput,
} from './organizations.js';

// Applications
export type {
  Application,
  ApplicationStatus,
  CreateApplicationInput,
  UpdateApplicationInput,
  ApplicationModule,
  CreateModuleInput,
  UpdateModuleInput,
} from './applications.js';

// Clients
export type {
  Client,
  ClientStatus,
  ClientType,
  GrantType,
  ResponseType,
  CreateClientInput,
  UpdateClientInput,
  ClientSecret,
  GenerateSecretInput,
  GeneratedSecret,
} from './clients.js';

// Users
export type {
  User,
  UserStatus,
  CreateUserInput,
  UpdateUserInput,
  InviteUserInput,
  SetPasswordInput,
  UserListParams,
} from './users.js';

// Roles
export type {
  Role,
  CreateRoleInput,
  UpdateRoleInput,
  RoleWithPermissions,
} from './roles.js';

// Permissions
export type {
  Permission,
  CreatePermissionInput,
} from './permissions.js';

// Custom Claims
export type {
  ClaimDefinition,
  ClaimValueType,
  CreateClaimDefinitionInput,
  UpdateClaimDefinitionInput,
  UserClaimValue,
  SetUserClaimInput,
} from './custom-claims.js';

// Config
export type {
  ConfigEntry,
  SetConfigInput,
} from './config.js';

// Keys
export type { SigningKey } from './keys.js';

// Audit
export type {
  AuditEntry,
  AuditListParams,
} from './audit.js';

// Stats
export type {
  DashboardStats,
  EntityCount,
} from './stats.js';

// Sessions
export type {
  AdminSession,
  SessionListParams,
  RevokeUserSessionsResult,
} from './sessions.js';

// Bulk
export type {
  BulkOrgAction,
  BulkUserAction,
  BulkOrgStatusInput,
  BulkUserStatusInput,
  BulkItemResult,
  BulkOperationResult,
} from './bulk.js';

// Branding
export type { BrandingAssets } from './branding.js';

// Exports
export type {
  ExportEntityType,
  ExportFormat,
  ExportParams,
} from './exports.js';

// Two-Factor
export type {
  TwoFactorMethod,
  TwoFactorStatus,
} from './two-factor.js';

// Imports
export type {
  ImportMode,
  ImportManifest,
  ImportEntityResult,
  ImportSkippedResult,
  ImportErrorResult,
  ImportClientCredentials,
  ImportResult,
} from './imports.js';

// User Roles
export type {
  UserRoleAssignment,
  AssignRoleInput,
} from './user-roles.js';

// User Claims
export type {
  UserClaimEntry,
  SetUserClaimValueInput,
} from './user-claims.js';
