/**
 * Tests for the app command group (app, module, role, permission, claim).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApplications = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  getHistory: vi.fn(),
  listModules: vi.fn(),
  addModule: vi.fn(),
  updateModule: vi.fn(),
  removeModule: vi.fn(),
};

const mockRoles = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  assignPermission: vi.fn(),
  removePermission: vi.fn(),
};

const mockPermissions = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  archive: vi.fn(),
};

const mockCustomClaims = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  archive: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({
    applications: mockApplications,
    roles: mockRoles,
    permissions: mockPermissions,
    customClaims: mockCustomClaims,
  })),
}));

vi.mock('../../src/error-handler.js', () => ({
  handleError: vi.fn(),
}));

vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  formatDate: vi.fn((d: string) => d ?? 'N/A'),
  truncate: vi.fn((s: string) => s?.slice(0, 8) ?? ''),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
  question: vi.fn(),
}));

import { printTable, printJson, success, warn, info } from '../../src/output.js';
import { confirm } from '../../src/prompt.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleApp = {
  id: 'app-uuid-1234',
  organizationId: 'org-uuid-5678',
  name: 'My App',
  slug: 'my-app',
  description: 'A test app',
  status: 'active',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const sampleRole = {
  id: 'role-uuid-1234',
  applicationId: 'app-uuid-1234',
  name: 'Admin',
  slug: 'admin',
  description: 'Admin role',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const samplePerm = {
  id: 'perm-uuid-1234',
  applicationId: 'app-uuid-1234',
  name: 'Read Users',
  slug: 'read-users',
  description: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const sampleClaim = {
  id: 'claim-uuid-1234',
  applicationId: 'app-uuid-1234',
  name: 'Department',
  slug: 'department',
  valueType: 'string',
  description: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const sampleModule = {
  id: 'mod-uuid-1234',
  applicationId: 'app-uuid-1234',
  name: 'CRM',
  slug: 'crm',
  description: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function invokeSubcommand(subcommands: string[], extraArgs: Record<string, unknown> = {}) {
  const yargs = (await import('yargs')).default;
  const { appCommand } = await import('../../src/commands/app.js');

  const args = ['app', ...subcommands];
  for (const [key, value] of Object.entries(extraArgs)) {
    if (key.startsWith('_pos_')) continue;
    if (typeof value === 'boolean') {
      if (value) args.push(`--${key}`);
    } else {
      args.push(`--${key}`, String(value));
    }
  }

  try {
    await yargs(args)
      .command(appCommand)
      .option('json', { type: 'boolean', default: false })
      .option('verbose', { type: 'boolean', default: false })
      .option('insecure', { type: 'boolean', default: false })
      .option('force', { type: 'boolean', default: false })
      .option('server', { type: 'string' })
      .fail(false)
      .parse();
  } catch {
    // yargs may throw; we verify via mocks
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('app command', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('creates an application', async () => {
      mockApplications.create.mockResolvedValue(sampleApp);
      await invokeSubcommand(['create'], { 'org-id': 'org-1', name: 'My App' });
      expect(mockApplications.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'My App' }));
      expect(success).toHaveBeenCalledWith(expect.stringContaining('My App'));
    });

    it('outputs JSON', async () => {
      mockApplications.create.mockResolvedValue(sampleApp);
      await invokeSubcommand(['create'], { 'org-id': 'org-1', name: 'My App', json: true });
      expect(printJson).toHaveBeenCalledWith(sampleApp);
    });
  });

  describe('list', () => {
    it('lists applications', async () => {
      mockApplications.list.mockResolvedValue({ data: [sampleApp], total: 1, page: 1, pageSize: 20 });
      await invokeSubcommand(['list'], {});
      expect(printTable).toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith('Total: 1 applications');
    });

    it('warns when empty', async () => {
      mockApplications.list.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
      await invokeSubcommand(['list'], {});
      expect(warn).toHaveBeenCalledWith('No applications found');
    });
  });

  describe('show', () => {
    it('shows application details', async () => {
      mockApplications.get.mockResolvedValue({ data: sampleApp, etag: '"v1"' });
      await invokeSubcommand(['show', 'my-app'], {});
      expect(mockApplications.get).toHaveBeenCalledWith('my-app');
      expect(printTable).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates application with ETag', async () => {
      mockApplications.get.mockResolvedValue({ data: sampleApp, etag: '"v1"' });
      mockApplications.update.mockResolvedValue({ ...sampleApp, name: 'New Name' });
      await invokeSubcommand(['update', 'my-app'], { name: 'New Name' });
      expect(mockApplications.update).toHaveBeenCalledWith('my-app', expect.objectContaining({ name: 'New Name' }), '"v1"');
    });
  });

  describe('archive', () => {
    it('archives after confirmation', async () => {
      mockApplications.get.mockResolvedValue({ data: sampleApp, etag: '"v1"' });
      vi.mocked(confirm).mockResolvedValue(true);
      await invokeSubcommand(['archive', 'my-app'], {});
      expect(mockApplications.archive).toHaveBeenCalledWith(sampleApp.id);
    });

    it('skips with --force', async () => {
      mockApplications.get.mockResolvedValue({ data: sampleApp, etag: '"v1"' });
      await invokeSubcommand(['archive', 'my-app'], { force: true });
      expect(confirm).not.toHaveBeenCalled();
      expect(mockApplications.archive).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('restores an application', async () => {
      mockApplications.get.mockResolvedValue({ data: sampleApp, etag: '"v1"' });
      await invokeSubcommand(['restore', 'my-app'], {});
      expect(mockApplications.restore).toHaveBeenCalledWith(sampleApp.id);
    });
  });

  describe('history', () => {
    it('shows history', async () => {
      mockApplications.getHistory.mockResolvedValue([{
        id: 'h1', action: 'created', performedBy: 'admin', changes: {}, createdAt: '2024-01-01T00:00:00Z',
      }]);
      await invokeSubcommand(['history', 'my-app'], {});
      expect(printTable).toHaveBeenCalled();
    });
  });
});

describe('app module command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds a module', async () => {
    mockApplications.addModule.mockResolvedValue(sampleModule);
    await invokeSubcommand(['module', 'add', 'app-1'], { name: 'CRM' });
    expect(mockApplications.addModule).toHaveBeenCalledWith('app-1', expect.objectContaining({ name: 'CRM' }));
    expect(success).toHaveBeenCalled();
  });

  it('lists modules', async () => {
    mockApplications.listModules.mockResolvedValue([sampleModule]);
    await invokeSubcommand(['module', 'list', 'app-1'], {});
    expect(printTable).toHaveBeenCalled();
  });

  it('removes a module', async () => {
    await invokeSubcommand(['module', 'remove', 'app-1', 'mod-1'], {});
    expect(mockApplications.removeModule).toHaveBeenCalledWith('app-1', 'mod-1');
  });
});

describe('app role command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a role', async () => {
    mockRoles.create.mockResolvedValue(sampleRole);
    await invokeSubcommand(['role', 'create', 'app-1'], { name: 'Admin' });
    expect(mockRoles.create).toHaveBeenCalledWith('app-1', expect.objectContaining({ name: 'Admin' }));
  });

  it('lists roles', async () => {
    mockRoles.list.mockResolvedValue({ data: [sampleRole], total: 1 });
    await invokeSubcommand(['role', 'list', 'app-1'], {});
    expect(printTable).toHaveBeenCalled();
  });

  it('shows a role', async () => {
    mockRoles.get.mockResolvedValue(sampleRole);
    await invokeSubcommand(['role', 'show', 'app-1', 'role-1'], {});
    expect(printTable).toHaveBeenCalled();
  });

  it('archives a role', async () => {
    await invokeSubcommand(['role', 'archive', 'app-1', 'role-1'], {});
    expect(mockRoles.archive).toHaveBeenCalledWith('app-1', 'role-1');
  });

  it('assigns a permission', async () => {
    await invokeSubcommand(['role', 'assign-perm', 'app-1', 'role-1', 'perm-1'], {});
    expect(mockRoles.assignPermission).toHaveBeenCalledWith('app-1', 'role-1', 'perm-1');
  });

  it('removes a permission', async () => {
    await invokeSubcommand(['role', 'remove-perm', 'app-1', 'role-1', 'perm-1'], {});
    expect(mockRoles.removePermission).toHaveBeenCalledWith('app-1', 'role-1', 'perm-1');
  });
});

describe('app permission command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a permission', async () => {
    mockPermissions.create.mockResolvedValue(samplePerm);
    await invokeSubcommand(['permission', 'create', 'app-1'], { name: 'Read Users' });
    expect(mockPermissions.create).toHaveBeenCalledWith('app-1', expect.objectContaining({ name: 'Read Users' }));
  });

  it('lists permissions', async () => {
    mockPermissions.list.mockResolvedValue({ data: [samplePerm], total: 1 });
    await invokeSubcommand(['permission', 'list', 'app-1'], {});
    expect(printTable).toHaveBeenCalled();
  });

  it('archives a permission', async () => {
    await invokeSubcommand(['permission', 'archive', 'app-1', 'perm-1'], {});
    expect(mockPermissions.archive).toHaveBeenCalledWith('app-1', 'perm-1');
  });
});

describe('app claim command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a claim', async () => {
    mockCustomClaims.create.mockResolvedValue(sampleClaim);
    await invokeSubcommand(['claim', 'create', 'app-1'], { name: 'Department', type: 'string' });
    expect(mockCustomClaims.create).toHaveBeenCalledWith('app-1', expect.objectContaining({ name: 'Department' }));
  });

  it('lists claims', async () => {
    mockCustomClaims.list.mockResolvedValue({ data: [sampleClaim], total: 1 });
    await invokeSubcommand(['claim', 'list', 'app-1'], {});
    expect(printTable).toHaveBeenCalled();
  });

  it('shows a claim', async () => {
    mockCustomClaims.get.mockResolvedValue(sampleClaim);
    await invokeSubcommand(['claim', 'show', 'app-1', 'claim-1'], {});
    expect(printTable).toHaveBeenCalled();
  });

  it('archives a claim', async () => {
    await invokeSubcommand(['claim', 'archive', 'app-1', 'claim-1'], {});
    expect(mockCustomClaims.archive).toHaveBeenCalledWith('app-1', 'claim-1');
  });
});
