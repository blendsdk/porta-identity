import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bootstrap
vi.mock('../../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn().mockImplementation(async (_argv: unknown, fn: () => Promise<unknown>) => fn()),
  withHttpClient: vi.fn().mockImplementation(async (_argv: unknown, fn: (client: unknown) => Promise<unknown>) => fn({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() })),
}));

// Mock error handler — run fn directly
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandling: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
}));

// Mock output helpers
vi.mock('../../../../src/cli/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  outputResult: vi.fn(),
  truncateId: vi.fn().mockImplementation((s: string) => s.length > 8 ? s.substring(0, 8) + '...' : s),
  formatDate: vi.fn().mockImplementation((d: string | Date | null) => d ? String(d).split('T')[0] : '—'),
  printTotal: vi.fn(),
}));

// Mock prompt
vi.mock('../../../../src/cli/prompt.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Mock application service
vi.mock('../../../../src/applications/index.js', () => ({
  createApplication: vi.fn(),
  listApplications: vi.fn(),
  getApplicationById: vi.fn(),
  getApplicationBySlug: vi.fn(),
  updateApplication: vi.fn(),
  archiveApplication: vi.fn(),
  createModule: vi.fn(),
  listModules: vi.fn(),
  updateModule: vi.fn(),
  deactivateModule: vi.fn(),
  ApplicationNotFoundError: class ApplicationNotFoundError extends Error {
    constructor(id: string) { super(`Application not found: ${id}`); this.name = 'ApplicationNotFoundError'; }
  },
}));

// Mock RBAC service
vi.mock('../../../../src/rbac/index.js', () => ({
  createRole: vi.fn(),
  listRolesByApplication: vi.fn(),
  findRoleById: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getPermissionsForRole: vi.fn(),
  assignPermissionsToRole: vi.fn(),
  removePermissionsFromRole: vi.fn(),
  createPermission: vi.fn(),
  listPermissionsByApplication: vi.fn(),
  updatePermission: vi.fn(),
  deletePermission: vi.fn(),
  RoleNotFoundError: class RoleNotFoundError extends Error {
    constructor(id: string) { super(`Role not found: ${id}`); this.name = 'RoleNotFoundError'; }
  },
}));

// Mock custom claims service
vi.mock('../../../../src/custom-claims/index.js', () => ({
  createDefinition: vi.fn(),
  listDefinitions: vi.fn(),
  updateDefinition: vi.fn(),
  deleteDefinition: vi.fn(),
}));

import { appCommand } from '../../../../src/cli/commands/app.js';
import { success, warn, outputResult, printTable } from '../../../../src/cli/output.js';
import { confirm } from '../../../../src/cli/prompt.js';
import {
  createApplication,
  listApplications,
  getApplicationById,
  getApplicationBySlug,
  updateApplication,
  archiveApplication,
  createModule,
  listModules,
  deactivateModule,
} from '../../../../src/applications/index.js';
import {
  createRole,
  listRolesByApplication,
  findRoleById,
  deleteRole,
  getPermissionsForRole,
  assignPermissionsToRole,
  createPermission,
  listPermissionsByApplication,
  deletePermission,
} from '../../../../src/rbac/index.js';
import {
  createDefinition,
  listDefinitions,
  deleteDefinition,
} from '../../../../src/custom-claims/index.js';
import type { GlobalOptions } from '../../../../src/cli/index.js';

/** Fake app for test data */
const fakeApp = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  name: 'BusinessSuite',
  slug: 'business-suite',
  description: 'Main business app',
  status: 'active' as const,
  createdAt: new Date('2026-04-08'),
  updatedAt: new Date('2026-04-09'),
};

/** Fake module for test data */
const fakeModule = {
  id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  applicationId: fakeApp.id,
  name: 'CRM',
  slug: 'crm',
  description: 'Customer relationship management',
  status: 'active' as const,
  createdAt: new Date('2026-04-08'),
  updatedAt: new Date('2026-04-09'),
};

function createArgv(overrides: Partial<GlobalOptions & Record<string, unknown>> = {}): GlobalOptions & Record<string, unknown> {
  return { json: false, verbose: false, force: false, 'dry-run': false, ...overrides };
}

/**
 * Extract subcommand handlers from the app command builder.
 * Handles both simple commands and nested command groups (module, role, etc.).
 */
function getHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
  const nestedGroups: Record<string, Record<string, (args: Record<string, unknown>) => Promise<void>>> = {};

  const fakeYargs = {
    command: (cmd: string | object, _desc?: string, _builder?: unknown, handler?: unknown) => {
      if (typeof cmd === 'string') {
        const name = cmd.split(' ')[0];
        handlers[name] = handler as (args: Record<string, unknown>) => Promise<void>;
      } else if (typeof cmd === 'object' && 'command' in cmd) {
        // Nested command group (e.g., appModuleCommand)
        const group = cmd as { command: string; builder: (y: typeof fakeYargs) => typeof fakeYargs };
        const groupName = group.command;
        const groupHandlers: Record<string, (args: Record<string, unknown>) => Promise<void>> = {};
        const groupYargs = {
          command: (subcmd: string, _d?: string, _b?: unknown, h?: unknown) => {
            if (typeof subcmd === 'string') {
              const subName = subcmd.split(' ')[0];
              groupHandlers[subName] = h as (args: Record<string, unknown>) => Promise<void>;
            }
            return groupYargs;
          },
          option: () => groupYargs,
          positional: () => groupYargs,
          demandCommand: () => groupYargs,
        };
        group.builder(groupYargs as unknown as typeof fakeYargs);
        nestedGroups[groupName] = groupHandlers;
      }
      return fakeYargs;
    },
    option: () => fakeYargs,
    positional: () => fakeYargs,
    demandCommand: () => fakeYargs,
  };
  (appCommand.builder as (y: typeof fakeYargs) => typeof fakeYargs)(fakeYargs);
  return { handlers, nestedGroups };
}

// TODO: Phase 5 — rewrite tests to mock HTTP client instead of domain services
describe.skip('CLI App Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(outputResult).mockImplementation(
      (_isJson: boolean, tableRenderer: () => void) => { tableRenderer(); },
    );
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(getApplicationById).mockResolvedValue(fakeApp);
    vi.mocked(getApplicationBySlug).mockResolvedValue(fakeApp);
  });

  describe('app create', () => {
    it('should create an application and display success', async () => {
      vi.mocked(createApplication).mockResolvedValue(fakeApp);

      const { handlers } = getHandlers();
      await handlers['create'](createArgv({ name: 'BusinessSuite' }));

      expect(createApplication).toHaveBeenCalledWith({
        name: 'BusinessSuite',
        slug: undefined,
        description: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('BusinessSuite'));
    });
  });

  describe('app list', () => {
    it('should list applications in table format', async () => {
      vi.mocked(listApplications).mockResolvedValue({
        data: [fakeApp],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const { handlers } = getHandlers();
      await handlers['list'](createArgv({ page: 1, 'page-size': 20 }));

      expect(listApplications).toHaveBeenCalled();
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no applications found', async () => {
      vi.mocked(listApplications).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      const { handlers } = getHandlers();
      await handlers['list'](createArgv({ page: 1, 'page-size': 20 }));

      expect(warn).toHaveBeenCalledWith('No applications found');
    });
  });

  describe('app show', () => {
    it('should show app details by slug', async () => {
      const { handlers } = getHandlers();
      await handlers['show'](createArgv({ 'id-or-slug': 'business-suite' }));

      expect(getApplicationBySlug).toHaveBeenCalledWith('business-suite');
      expect(printTable).toHaveBeenCalled();
    });

    it('should throw NotFoundError when app not found', async () => {
      vi.mocked(getApplicationBySlug).mockResolvedValue(null);

      const { handlers } = getHandlers();
      await expect(handlers['show'](createArgv({ 'id-or-slug': 'nonexistent' }))).rejects.toThrow(
        'Application not found',
      );
    });
  });

  describe('app update', () => {
    it('should update app name', async () => {
      vi.mocked(updateApplication).mockResolvedValue({ ...fakeApp, name: 'New Name' });

      const { handlers } = getHandlers();
      await handlers['update'](createArgv({ 'id-or-slug': 'business-suite', name: 'New Name' }));

      expect(updateApplication).toHaveBeenCalledWith(fakeApp.id, {
        name: 'New Name',
        description: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('New Name'));
    });
  });

  describe('app archive', () => {
    it('should archive app with confirmation', async () => {
      const { handlers } = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'business-suite', force: true }));

      expect(archiveApplication).toHaveBeenCalledWith(fakeApp.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('archived'));
    });

    it('should show dry-run message for archive', async () => {
      const { handlers } = getHandlers();
      await handlers['archive'](createArgv({ 'id-or-slug': 'business-suite', 'dry-run': true }));

      expect(archiveApplication).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  describe('app module create', () => {
    it('should create a module within an app', async () => {
      vi.mocked(createModule).mockResolvedValue(fakeModule);

      const { nestedGroups } = getHandlers();
      await nestedGroups['module']['create'](createArgv({ app: fakeApp.id, name: 'CRM' }));

      expect(createModule).toHaveBeenCalledWith(fakeApp.id, {
        name: 'CRM',
        slug: undefined,
        description: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('CRM'));
    });
  });

  describe('app module list', () => {
    it('should list modules for an app', async () => {
      vi.mocked(listModules).mockResolvedValue([fakeModule]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['module']['list'](createArgv({ app: fakeApp.id }));

      expect(listModules).toHaveBeenCalledWith(fakeApp.id);
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no modules found', async () => {
      vi.mocked(listModules).mockResolvedValue([]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['module']['list'](createArgv({ app: fakeApp.id }));

      expect(warn).toHaveBeenCalledWith('No modules found');
    });
  });

  describe('app module deactivate', () => {
    it('should deactivate a module with confirmation', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['module']['deactivate'](createArgv({ 'module-id': fakeModule.id, force: true }));

      expect(deactivateModule).toHaveBeenCalledWith(fakeModule.id);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('deactivated'));
    });
  });

  describe('app role create', () => {
    it('should create a role for an app', async () => {
      const fakeRole = { id: 'r1', applicationId: fakeApp.id, name: 'Admin', slug: 'admin', description: null, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(createRole).mockResolvedValue(fakeRole);

      const { nestedGroups } = getHandlers();
      await nestedGroups['role']['create'](createArgv({ app: fakeApp.id, name: 'Admin' }));

      expect(createRole).toHaveBeenCalledWith({ applicationId: fakeApp.id, name: 'Admin', description: undefined });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Admin'));
    });
  });

  describe('app role list', () => {
    it('should list roles for an app', async () => {
      const fakeRole = { id: 'r1', applicationId: fakeApp.id, name: 'Admin', slug: 'admin', description: null, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(listRolesByApplication).mockResolvedValue([fakeRole]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['role']['list'](createArgv({ app: fakeApp.id }));

      expect(listRolesByApplication).toHaveBeenCalledWith(fakeApp.id);
      expect(outputResult).toHaveBeenCalled();
    });

    it('should warn when no roles found', async () => {
      vi.mocked(listRolesByApplication).mockResolvedValue([]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['role']['list'](createArgv({ app: fakeApp.id }));

      expect(warn).toHaveBeenCalledWith('No roles found');
    });
  });

  describe('app role show', () => {
    it('should show role details with permissions', async () => {
      const fakeRole = { id: 'r1', applicationId: fakeApp.id, name: 'Admin', slug: 'admin', description: 'Admin role', createdAt: new Date(), updatedAt: new Date() };
      const fakePerm = { id: 'p1', applicationId: fakeApp.id, name: 'Read', slug: 'read', description: null, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(findRoleById).mockResolvedValue(fakeRole);
      vi.mocked(getPermissionsForRole).mockResolvedValue([fakePerm]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['role']['show'](createArgv({ 'role-id': 'r1' }));

      expect(findRoleById).toHaveBeenCalledWith('r1');
      expect(getPermissionsForRole).toHaveBeenCalledWith('r1');
      expect(printTable).toHaveBeenCalled();
    });
  });

  describe('app role delete', () => {
    it('should delete a role with confirmation', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['role']['delete'](createArgv({ 'role-id': 'r1', force: true }));

      expect(deleteRole).toHaveBeenCalledWith('r1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('deleted'));
    });
  });

  describe('app role assign-permissions', () => {
    it('should assign permissions to a role', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['role']['assign-permissions'](createArgv({ 'role-id': 'r1', 'permission-ids': 'p1,p2' }));

      expect(assignPermissionsToRole).toHaveBeenCalledWith('r1', ['p1', 'p2']);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('2 permission'));
    });
  });

  describe('app permission create', () => {
    it('should create a permission for an app', async () => {
      const fakePerm = { id: 'p1', applicationId: fakeApp.id, name: 'Read Users', slug: 'users:read', description: null, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(createPermission).mockResolvedValue(fakePerm);

      const { nestedGroups } = getHandlers();
      await nestedGroups['permission']['create'](createArgv({ app: fakeApp.id, name: 'Read Users', slug: 'users:read' }));

      expect(createPermission).toHaveBeenCalledWith({
        applicationId: fakeApp.id, name: 'Read Users', slug: 'users:read', description: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Read Users'));
    });
  });

  describe('app permission list', () => {
    it('should list permissions for an app', async () => {
      const fakePerm = { id: 'p1', applicationId: fakeApp.id, name: 'Read', slug: 'read', description: null, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(listPermissionsByApplication).mockResolvedValue([fakePerm]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['permission']['list'](createArgv({ app: fakeApp.id }));

      expect(listPermissionsByApplication).toHaveBeenCalledWith(fakeApp.id);
      expect(outputResult).toHaveBeenCalled();
    });
  });

  describe('app permission delete', () => {
    it('should delete a permission with confirmation', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['permission']['delete'](createArgv({ 'permission-id': 'p1', force: true }));

      expect(deletePermission).toHaveBeenCalledWith('p1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('deleted'));
    });
  });

  describe('app claim create', () => {
    it('should create a claim definition', async () => {
      const fakeClaim = { id: 'cl1', applicationId: fakeApp.id, claimName: 'department', claimType: 'string', description: null, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(createDefinition).mockResolvedValue(fakeClaim);

      const { nestedGroups } = getHandlers();
      await nestedGroups['claim']['create'](createArgv({ app: fakeApp.id, name: 'department', type: 'string' }));

      expect(createDefinition).toHaveBeenCalledWith({
        applicationId: fakeApp.id, claimName: 'department', claimType: 'string', description: undefined,
      });
      expect(success).toHaveBeenCalledWith(expect.stringContaining('department'));
    });
  });

  describe('app claim list', () => {
    it('should list claim definitions for an app', async () => {
      const fakeClaim = { id: 'cl1', applicationId: fakeApp.id, claimName: 'department', claimType: 'string', description: null, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(listDefinitions).mockResolvedValue([fakeClaim]);

      const { nestedGroups } = getHandlers();
      await nestedGroups['claim']['list'](createArgv({ app: fakeApp.id }));

      expect(listDefinitions).toHaveBeenCalledWith(fakeApp.id);
      expect(outputResult).toHaveBeenCalled();
    });
  });

  describe('app claim delete', () => {
    it('should delete a claim definition with confirmation', async () => {
      const { nestedGroups } = getHandlers();
      await nestedGroups['claim']['delete'](createArgv({ 'claim-id': 'cl1', force: true }));

      expect(deleteDefinition).toHaveBeenCalledWith('cl1');
      expect(success).toHaveBeenCalledWith(expect.stringContaining('deleted'));
    });
  });

  describe('command metadata', () => {
    it('should have correct command name', () => {
      expect(appCommand.command).toBe('app');
    });

    it('should have a description', () => {
      expect(appCommand.describe).toBe('Manage applications');
    });
  });
});
