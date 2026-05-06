/**
 * @portaidentity/sdk/agent — AI Agent entrypoint.
 *
 * Provides tool definitions for all Porta SDK operations and an executor
 * that maps tool names + arguments to PortaClient method calls.
 *
 * @module @portaidentity/sdk/agent
 */

import type { PortaClient } from './client.js';

// ---------------------------------------------------------------------------
// Tool Definition Types
// ---------------------------------------------------------------------------

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  returns: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Parameter helpers
// ---------------------------------------------------------------------------

function param(name: string, type: ToolParameter['type'], description: string, required = true, enumValues?: string[]): ToolParameter {
  return { name, type, description, required, ...(enumValues ? { enum: enumValues } : {}) };
}

const ID = (name: string, desc: string) => param(name, 'string', desc);
const OPT_STR = (name: string, desc: string) => param(name, 'string', desc, false);
const OPT_NUM = (name: string, desc: string) => param(name, 'number', desc, false);
const OPT_OBJ = (name: string, desc: string) => param(name, 'object', desc, false);
const OBJ = (name: string, desc: string) => param(name, 'object', desc, true);

// Standard list params
const LIST_PARAMS: ToolParameter[] = [
  OPT_NUM('page', 'Page number'),
  OPT_NUM('pageSize', 'Items per page'),
  OPT_STR('search', 'Search query'),
  OPT_STR('sort', 'Sort field'),
  OPT_STR('order', 'Sort order (asc/desc)'),
];

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS: ToolDefinition[] = [
  // Organizations
  { name: 'organizations.list', description: 'List organizations with pagination', parameters: [...LIST_PARAMS], returns: 'PaginatedResponse<Organization>' },
  { name: 'organizations.get', description: 'Get an organization by ID or slug', parameters: [ID('idOrSlug', 'Organization ID or slug')], returns: '{ data: Organization, etag: string | null }' },
  { name: 'organizations.create', description: 'Create a new organization', parameters: [OBJ('input', 'CreateOrganizationInput')], returns: 'Organization' },
  { name: 'organizations.update', description: 'Update an organization', parameters: [ID('idOrSlug', 'Organization ID or slug'), OBJ('input', 'UpdateOrganizationInput'), OPT_STR('etag', 'ETag for concurrency')], returns: 'Organization' },
  { name: 'organizations.suspend', description: 'Suspend an organization', parameters: [ID('idOrSlug', 'Organization ID or slug')], returns: 'void' },
  { name: 'organizations.activate', description: 'Activate an organization', parameters: [ID('idOrSlug', 'Organization ID or slug')], returns: 'void' },
  { name: 'organizations.archive', description: 'Archive an organization', parameters: [ID('idOrSlug', 'Organization ID or slug')], returns: 'void' },
  { name: 'organizations.destroy', description: 'Permanently delete an organization', parameters: [ID('idOrSlug', 'Organization ID or slug')], returns: 'DestroyResult' },

  // Applications
  { name: 'applications.list', description: 'List applications', parameters: [...LIST_PARAMS], returns: 'PaginatedResponse<Application>' },
  { name: 'applications.get', description: 'Get an application by ID or slug', parameters: [ID('idOrSlug', 'Application ID or slug')], returns: '{ data: Application, etag: string | null }' },
  { name: 'applications.create', description: 'Create a new application', parameters: [OBJ('input', 'CreateApplicationInput')], returns: 'Application' },
  { name: 'applications.update', description: 'Update an application', parameters: [ID('idOrSlug', 'Application ID or slug'), OBJ('input', 'UpdateApplicationInput'), OPT_STR('etag', 'ETag')], returns: 'Application' },

  // Clients
  { name: 'clients.list', description: 'List clients', parameters: [...LIST_PARAMS], returns: 'PaginatedResponse<Client>' },
  { name: 'clients.get', description: 'Get a client by ID', parameters: [ID('idOrClientId', 'Client ID or clientId')], returns: '{ data: Client, etag: string | null }' },
  { name: 'clients.create', description: 'Create a new client', parameters: [OBJ('input', 'CreateClientInput')], returns: 'Client' },
  { name: 'clients.update', description: 'Update a client', parameters: [ID('idOrClientId', 'Client ID'), OBJ('input', 'UpdateClientInput'), OPT_STR('etag', 'ETag')], returns: 'Client' },
  { name: 'clients.generateSecret', description: 'Generate a new secret for a client', parameters: [ID('clientId', 'Client ID'), OPT_OBJ('input', 'GenerateSecretInput')], returns: 'GeneratedSecret' },

  // Users
  { name: 'users.list', description: 'List users in an organization', parameters: [ID('orgId', 'Organization ID'), ...LIST_PARAMS], returns: 'PaginatedResponse<User>' },
  { name: 'users.get', description: 'Get a user by ID', parameters: [ID('orgId', 'Organization ID'), ID('userId', 'User ID')], returns: '{ data: User, etag: string | null }' },
  { name: 'users.create', description: 'Create a new user', parameters: [OBJ('input', 'CreateUserInput')], returns: 'User' },
  { name: 'users.invite', description: 'Invite a user', parameters: [OBJ('input', 'InviteUserInput')], returns: 'User' },
  { name: 'users.suspend', description: 'Suspend a user', parameters: [ID('orgId', 'Organization ID'), ID('userId', 'User ID')], returns: 'void' },
  { name: 'users.activate', description: 'Activate a user', parameters: [ID('orgId', 'Organization ID'), ID('userId', 'User ID')], returns: 'void' },

  // Roles
  { name: 'roles.list', description: 'List roles for an application', parameters: [ID('appId', 'Application ID'), ...LIST_PARAMS], returns: 'PaginatedResponse<Role>' },
  { name: 'roles.get', description: 'Get a role with permissions', parameters: [ID('appId', 'Application ID'), ID('roleId', 'Role ID')], returns: 'RoleWithPermissions' },
  { name: 'roles.create', description: 'Create a role', parameters: [ID('appId', 'Application ID'), OBJ('input', 'CreateRoleInput')], returns: 'Role' },

  // Permissions
  { name: 'permissions.list', description: 'List permissions for an application', parameters: [ID('appId', 'Application ID'), ...LIST_PARAMS], returns: 'PaginatedResponse<Permission>' },
  { name: 'permissions.create', description: 'Create a permission', parameters: [ID('appId', 'Application ID'), OBJ('input', 'CreatePermissionInput')], returns: 'Permission' },

  // User Roles
  { name: 'userRoles.list', description: 'List role assignments for a user', parameters: [ID('orgId', 'Organization ID'), ID('userId', 'User ID')], returns: 'UserRoleAssignment[]' },
  { name: 'userRoles.assign', description: 'Assign a role to a user', parameters: [ID('orgId', 'Organization ID'), ID('userId', 'User ID'), ID('roleId', 'Role ID')], returns: 'void' },
  { name: 'userRoles.remove', description: 'Remove a role from a user', parameters: [ID('orgId', 'Organization ID'), ID('userId', 'User ID'), ID('roleId', 'Role ID')], returns: 'void' },

  // Custom Claims
  { name: 'customClaims.list', description: 'List claim definitions for an application', parameters: [ID('appId', 'Application ID'), ...LIST_PARAMS], returns: 'PaginatedResponse<ClaimDefinition>' },
  { name: 'customClaims.create', description: 'Create a claim definition', parameters: [ID('appId', 'Application ID'), OBJ('input', 'CreateClaimDefinitionInput')], returns: 'ClaimDefinition' },

  // Config
  { name: 'config.list', description: 'List all system configuration entries', parameters: [], returns: 'ConfigEntry[]' },
  { name: 'config.get', description: 'Get a config entry', parameters: [ID('key', 'Configuration key')], returns: 'ConfigEntry' },
  { name: 'config.set', description: 'Set a config entry value', parameters: [ID('key', 'Configuration key'), ID('value', 'New value')], returns: 'ConfigEntry' },

  // Keys
  { name: 'keys.list', description: 'List signing keys', parameters: [], returns: 'SigningKey[]' },
  { name: 'keys.generate', description: 'Generate a new signing key', parameters: [], returns: 'SigningKey' },
  { name: 'keys.rotate', description: 'Rotate signing keys', parameters: [], returns: 'SigningKey' },

  // Audit
  { name: 'audit.list', description: 'List audit log entries', parameters: [...LIST_PARAMS, OPT_STR('eventType', 'Filter by event type'), OPT_STR('organizationId', 'Filter by org')], returns: 'PaginatedResponse<AuditEntry>' },

  // Stats
  { name: 'stats.get', description: 'Get dashboard statistics', parameters: [], returns: 'DashboardStats' },

  // Sessions
  { name: 'sessions.list', description: 'List active sessions', parameters: [OPT_NUM('page', 'Page'), OPT_NUM('pageSize', 'Page size'), OPT_STR('userId', 'Filter by user')], returns: 'PaginatedResponse<AdminSession>' },
  { name: 'sessions.revoke', description: 'Revoke a session', parameters: [ID('sessionId', 'Session ID')], returns: 'void' },
  { name: 'sessions.revokeForUser', description: 'Revoke all sessions for a user', parameters: [ID('userId', 'User ID')], returns: 'void' },

  // Bulk
  { name: 'bulk.execute', description: 'Execute a bulk status operation', parameters: [OBJ('input', 'BulkOperationInput')], returns: 'BulkOperationResult' },

  // Two-Factor
  { name: 'twoFactor.getStatus', description: 'Get 2FA status for a user', parameters: [ID('orgId', 'Organization ID'), ID('userId', 'User ID')], returns: 'TwoFactorStatus' },
  { name: 'twoFactor.disable', description: 'Disable 2FA for a user', parameters: [ID('orgId', 'Organization ID'), ID('userId', 'User ID')], returns: 'void' },

  // Imports
  { name: 'imports.provision', description: 'Import/provision data declaratively', parameters: [OBJ('manifest', 'ImportManifest')], returns: 'ImportResult' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns tool definitions for all Porta SDK operations.
 * AI agents use these to discover available tools and their parameters.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

/**
 * Executes a tool by name with the given arguments against a PortaClient.
 *
 * @param client - A configured PortaClient instance
 * @param toolName - Dot-notation tool name (e.g., 'organizations.list')
 * @param args - Arguments matching the tool's parameter definitions
 * @returns ToolResult with success/data or error
 */
export async function executeTool(
  client: PortaClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const [domain, method] = toolName.split('.');
    if (!domain || !method) {
      return { success: false, error: `Invalid tool name: ${toolName}. Expected format: domain.method` };
    }

    const domainObj = (client as unknown as Record<string, Record<string, Function>>)[domain];
    if (!domainObj) {
      return { success: false, error: `Unknown domain: ${domain}` };
    }

    const fn = domainObj[method];
    if (typeof fn !== 'function') {
      return { success: false, error: `Unknown method: ${method} on domain ${domain}` };
    }

    // Build arguments array based on tool definition
    const toolDef = TOOL_DEFINITIONS.find((t) => t.name === toolName);
    if (!toolDef) {
      return { success: false, error: `No tool definition found for: ${toolName}` };
    }

    const callArgs = toolDef.parameters
      .filter((p) => p.required || args[p.name] !== undefined)
      .map((p) => args[p.name]);

    const result = await fn.call(domainObj, ...callArgs);
    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
