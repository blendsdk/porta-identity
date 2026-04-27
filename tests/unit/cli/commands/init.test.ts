/**
 * Unit tests for the CLI init command.
 *
 * Tests the `porta init` bootstrap command with mocked service dependencies.
 * Verifies entity creation flow, safety guards, non-interactive mode,
 * signing key bootstrapping, and precondition checks.
 *
 * All service modules (organizations, applications, clients, users, RBAC,
 * signing-keys) are mocked to isolate the command's orchestration logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be defined before any imports from source files.
// vi.mock factories are hoisted, so they CANNOT reference top-level variables.
// We use simple return values here and override in beforeEach.
// ---------------------------------------------------------------------------

// Mock bootstrap — prevent actual DB/Redis connections
vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi
    .fn()
    .mockImplementation(
      async (_argv: unknown, fn: () => Promise<unknown>) => fn(),
    ),
}));

// Mock error handler — run fn directly, skip process.exit
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi
    .fn()
    .mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

// Mock output helpers
vi.mock('../../../../src/cli/output.js', () => ({
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock prompt helpers
vi.mock('../../../../src/cli/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  promptInput: vi.fn().mockResolvedValue('test-input'),
  promptPassword: vi.fn().mockResolvedValue('TestPassword123!'),
}));

// Service mocks — return null/undefined defaults; overridden in beforeEach
vi.mock('../../../../src/organizations/repository.js', () => ({
  findSuperAdminOrganization: vi.fn(),
}));

vi.mock('../../../../src/applications/index.js', () => ({
  getApplicationBySlug: vi.fn(),
  createApplication: vi.fn(),
}));

vi.mock('../../../../src/clients/index.js', () => ({
  createClient: vi.fn(),
  generateSecret: vi.fn(),
}));

vi.mock('../../../../src/users/index.js', () => ({
  createUser: vi.fn(),
  reactivateUser: vi.fn(),
  markEmailVerified: vi.fn(),
}));

vi.mock('../../../../src/rbac/index.js', () => ({
  createPermission: vi.fn(),
  createRole: vi.fn(),
  assignPermissionsToRole: vi.fn(),
  assignRolesToUser: vi.fn(),
}));

vi.mock('../../../../src/lib/signing-keys.js', () => ({
  ensureSigningKeys: vi.fn(),
}));

// Mock database — needed for system_config INSERT in Step 13
vi.mock('../../../../src/lib/database.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

// ---------------------------------------------------------------------------
// Imports — AFTER mock definitions
// ---------------------------------------------------------------------------

import { initCommand } from '../../../../src/cli/commands/init.js';
import { success, warn } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import { findSuperAdminOrganization } from '../../../../src/organizations/repository.js';
import {
  getApplicationBySlug,
  createApplication,
} from '../../../../src/applications/index.js';
import { createClient, generateSecret } from '../../../../src/clients/index.js';
import {
  createUser,
  reactivateUser,
  markEmailVerified,
} from '../../../../src/users/index.js';
import {
  createRole,
  createPermission,
  assignPermissionsToRole,
  assignRolesToUser,
} from '../../../../src/rbac/index.js';
import { ensureSigningKeys } from '../../../../src/lib/signing-keys.js';
import { ALL_ADMIN_PERMISSIONS, ALL_ADMIN_ROLES } from '../../../../src/lib/admin-permissions.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Fake data — defined after imports, referenced in beforeEach
// ---------------------------------------------------------------------------

const fakeSuperAdminOrg = {
  id: 'org-super-admin-id',
  name: 'Porta Admin',
  slug: 'porta-admin',
  status: 'active' as const,
  isSuperAdmin: true,
  defaultLocale: 'en',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeAdminApp = {
  id: 'app-admin-id',
  name: 'Porta Admin',
  slug: 'porta-admin',
  description: 'Porta administration application',
  status: 'active' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeAdminRole = {
  id: 'role-admin-id',
  applicationId: 'app-admin-id',
  name: 'Porta Administrator',
  slug: 'porta-admin',
  description: 'Full admin access',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeAdminClient = {
  id: 'client-cli-id',
  clientId: 'porta-cli-abc123',
  clientName: 'Porta Admin CLI',
  clientType: 'public' as const,
  applicationType: 'native' as const,
  status: 'active' as const,
};

/** Fake admin GUI confidential client (Step 7b in init) */
const fakeGuiClient = {
  id: 'client-gui-id',
  clientId: 'porta-gui-xyz789',
  clientName: 'Porta Admin GUI',
  clientType: 'confidential' as const,
  applicationType: 'web' as const,
  status: 'active' as const,
};

/** Fake secret result returned by generateSecret for the GUI client */
const fakeGuiSecretResult = {
  id: 'secret-gui-id',
  clientId: 'client-gui-id',
  label: 'Initial secret (porta init)',
  plaintext: 'super-secret-gui-plaintext-abc123',
  expiresAt: null,
  createdAt: new Date(),
};

const fakeAdminUser = {
  id: 'user-admin-id',
  email: 'admin@example.com',
  givenName: 'Admin',
  familyName: 'User',
  status: 'inactive' as const,
  organizationId: 'org-super-admin-id',
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface InitTestOptions extends GlobalOptions {
  email?: string;
  'given-name'?: string;
  'family-name'?: string;
  password?: string;
}

function createArgv(overrides: Partial<InitTestOptions> = {}): InitTestOptions {
  return {
    json: false,
    verbose: false,
    force: false,
    'dry-run': false,
    email: 'admin@example.com',
    'given-name': 'Admin',
    'family-name': 'User',
    password: 'SecurePassword123!',
    ...overrides,
  };
}

async function runInit(argv: InitTestOptions): Promise<void> {
  await (
    initCommand.handler as (args: InitTestOptions) => Promise<void>
  )(argv);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI Init Command', () => {
  let permissionCounter: number;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionCounter = 0;

    // Set up default mock implementations
    vi.mocked(findSuperAdminOrganization).mockResolvedValue(
      fakeSuperAdminOrg as never,
    );
    vi.mocked(getApplicationBySlug).mockResolvedValue(null);
    vi.mocked(createApplication).mockResolvedValue(fakeAdminApp as never);

    // createClient is called twice: first for CLI (public), then for GUI (confidential).
    // Use mockResolvedValueOnce to return different clients per call.
    vi.mocked(createClient)
      .mockResolvedValueOnce({ client: fakeAdminClient as never, secret: null })
      .mockResolvedValueOnce({ client: fakeGuiClient as never, secret: null });

    // generateSecret is called once for the GUI confidential client
    vi.mocked(generateSecret).mockResolvedValue(fakeGuiSecretResult as never);
    vi.mocked(createUser).mockResolvedValue(fakeAdminUser as never);
    vi.mocked(reactivateUser).mockResolvedValue(undefined as never);
    vi.mocked(markEmailVerified).mockResolvedValue(undefined as never);
    vi.mocked(createRole).mockResolvedValue(fakeAdminRole as never);
    vi.mocked(createPermission).mockImplementation(
      async (input: { applicationId: string; slug: string; name: string; description?: string }) => ({
        id: `perm-${++permissionCounter}`,
        applicationId: input.applicationId,
        moduleId: null,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        createdAt: new Date(),
      }),
    );
    vi.mocked(assignPermissionsToRole).mockResolvedValue(undefined);
    vi.mocked(assignRolesToUser).mockResolvedValue(undefined);
    vi.mocked(ensureSigningKeys).mockResolvedValue({ keys: [] } as never);
    vi.mocked(confirm).mockResolvedValue(true);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('full initialization (happy path)', () => {
    it('should create admin app, permissions, role, client, and user', async () => {
      await runInit(createArgv());

      expect(ensureSigningKeys).toHaveBeenCalledOnce();

      expect(createApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Porta Admin',
          slug: 'porta-admin',
        }),
      );

      // Should create all 42 granular permissions
      expect(createPermission).toHaveBeenCalledTimes(ALL_ADMIN_PERMISSIONS.length);
      expect(createPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: 'app-admin-id',
          slug: 'admin:org:create',
        }),
      );
      expect(createPermission).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'admin:audit:read' }),
      );

      // Should create all 5 admin roles
      expect(createRole).toHaveBeenCalledTimes(ALL_ADMIN_ROLES.length);
      expect(createRole).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: 'app-admin-id',
          slug: 'porta-super-admin',
          name: 'Super Admin',
        }),
      );

      // Should assign permissions to each role
      expect(assignPermissionsToRole).toHaveBeenCalledTimes(ALL_ADMIN_ROLES.length);

      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-super-admin-id',
          applicationId: 'app-admin-id',
          clientName: 'Porta Admin CLI',
          clientType: 'public',
          applicationType: 'native',
          requirePkce: true,
          grantTypes: ['authorization_code', 'refresh_token'],
        }),
      );

      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-super-admin-id',
          email: 'admin@example.com',
          givenName: 'Admin',
          familyName: 'User',
          password: 'SecurePassword123!',
        }),
      );

      expect(reactivateUser).toHaveBeenCalledWith('user-admin-id');
      expect(markEmailVerified).toHaveBeenCalledWith('user-admin-id');
      expect(assignRolesToUser).toHaveBeenCalledWith('user-admin-id', [
        'role-admin-id',
      ]);

      expect(success).toHaveBeenCalledWith('Porta initialization complete!');
    });
  });

  // -------------------------------------------------------------------------
  // Admin GUI client creation (Step 7b)
  // -------------------------------------------------------------------------

  describe('admin GUI client creation', () => {
    it('should create a confidential GUI client after the CLI client', async () => {
      await runInit(createArgv());

      // createClient should be called twice — CLI first, then GUI
      expect(createClient).toHaveBeenCalledTimes(2);

      // First call: CLI public client
      expect(createClient).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          clientName: 'Porta Admin CLI',
          clientType: 'public',
          applicationType: 'native',
          requirePkce: true,
        }),
      );

      // Second call: GUI confidential client
      expect(createClient).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          organizationId: 'org-super-admin-id',
          applicationId: 'app-admin-id',
          clientName: 'Porta Admin GUI',
          clientType: 'confidential',
          applicationType: 'web',
          redirectUris: ['http://localhost:4002/auth/callback'],
          postLogoutRedirectUris: ['http://localhost:4002'],
          grantTypes: ['authorization_code', 'refresh_token'],
          scope: 'openid profile email offline_access',
          requirePkce: false,
          tokenEndpointAuthMethod: 'client_secret_post',
          loginMethods: ['magic_link'],
        }),
      );
    });

    it('should generate a secret for the GUI client', async () => {
      await runInit(createArgv());

      // generateSecret should be called once with the GUI client's DB ID
      expect(generateSecret).toHaveBeenCalledOnce();
      expect(generateSecret).toHaveBeenCalledWith(
        'client-gui-id',
        { label: 'Initial secret (porta init)' },
      );
    });

    it('should display a warning about saving the GUI client secret', async () => {
      await runInit(createArgv());

      // The warn() call includes a message about saving the secret
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Save this secret'),
      );
    });

    it('should not generate a secret for the CLI public client', async () => {
      await runInit(createArgv());

      // generateSecret is called only for the GUI client, not the CLI client.
      // Verify it was called with the GUI client ID, not the CLI client ID.
      expect(generateSecret).not.toHaveBeenCalledWith(
        'client-cli-id',
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Safety guard
  // -------------------------------------------------------------------------

  describe('safety guard — already initialized', () => {
    it('should refuse when admin app already exists and --force is not set', async () => {
      vi.mocked(getApplicationBySlug).mockResolvedValue(fakeAdminApp as never);

      await expect(runInit(createArgv())).rejects.toThrow(
        'System already initialized',
      );

      expect(createApplication).not.toHaveBeenCalled();
      expect(createClient).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
    });

    it('should warn and exit when --force is set but re-init not supported', async () => {
      vi.mocked(getApplicationBySlug).mockResolvedValue(fakeAdminApp as never);
      vi.mocked(confirm).mockResolvedValue(true);

      await runInit(createArgv({ force: true }));

      expect(warn).toHaveBeenCalled();
      expect(createApplication).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Precondition: super-admin org missing
  // -------------------------------------------------------------------------

  describe('precondition — super-admin org missing', () => {
    it('should throw error when super-admin org does not exist', async () => {
      vi.mocked(findSuperAdminOrganization).mockResolvedValue(null as never);

      await expect(runInit(createArgv())).rejects.toThrow(
        'Super-admin organization not found',
      );

      expect(createApplication).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Non-interactive mode
  // -------------------------------------------------------------------------

  describe('non-interactive mode', () => {
    it('should work with all flags provided (no prompts)', async () => {
      await runInit(
        createArgv({
          email: 'ci-admin@corp.com',
          'given-name': 'CI',
          'family-name': 'Admin',
          password: 'CIPassword456!',
        }),
      );

      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ci-admin@corp.com',
          givenName: 'CI',
          familyName: 'Admin',
          password: 'CIPassword456!',
        }),
      );

      expect(success).toHaveBeenCalledWith('Porta initialization complete!');
    });
  });

  // -------------------------------------------------------------------------
  // Signing keys
  // -------------------------------------------------------------------------

  describe('signing key bootstrap', () => {
    it('should ensure signing keys exist before creating entities', async () => {
      const callOrder: string[] = [];
      vi.mocked(ensureSigningKeys).mockImplementation(async () => {
        callOrder.push('ensureSigningKeys');
        return { keys: [] } as never;
      });
      vi.mocked(createApplication).mockImplementation(async () => {
        callOrder.push('createApplication');
        return fakeAdminApp as never;
      });

      await runInit(createArgv());

      expect(callOrder[0]).toBe('ensureSigningKeys');
      expect(callOrder[1]).toBe('createApplication');
    });
  });

  // -------------------------------------------------------------------------
  // Command metadata
  // -------------------------------------------------------------------------

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(initCommand.command).toBe('init');
    });

    it('should have a description', () => {
      expect(initCommand.describe).toBeTruthy();
    });
  });
});
