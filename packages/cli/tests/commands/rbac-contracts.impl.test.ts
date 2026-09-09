import { beforeEach, describe, expect, it, vi } from 'vitest';

const role = {
  id: 'role-1',
  applicationId: 'app-1',
  name: 'Billing Reader',
  slug: 'billing-reader',
  description: null,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
};
const permission = {
  id: 'permission-1',
  applicationId: 'app-1',
  moduleId: null,
  name: 'Read invoices',
  slug: 'billing:invoice:read',
  description: null,
  createdAt: '2026-09-10T00:00:00.000Z',
};
const reduction = { reauthenticationRequired: true };

const roles = {
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  removePermissions: vi.fn(),
};
const permissions = {
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const userRoles = {
  remove: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ roles, permissions, userRoles })),
}));

vi.mock('../../src/error-handler.js', () => ({ handleError: vi.fn() }));
vi.mock('../../src/output.js', () => ({
  printTable: vi.fn(),
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  formatDate: vi.fn((value: string) => value),
}));
vi.mock('../../src/prompt.js', () => ({ confirm: vi.fn().mockResolvedValue(true) }));

import { printJson, success, warn } from '../../src/output.js';

/** Invoke one application command through the production command tree. */
async function invokeApp(arguments_: string[]): Promise<void> {
  const yargs = (await import('yargs')).default;
  const { appCommand } = await import('../../src/commands/app.js');
  await yargs(['app', ...arguments_])
    .command(appCommand)
    .option('json', { type: 'boolean', default: false })
    .option('verbose', { type: 'boolean', default: false })
    .option('insecure', { type: 'boolean', default: false })
    .option('server', { type: 'string' })
    .fail(false)
    .parse();
}

/** Invoke one user command through the production command tree. */
async function invokeUser(arguments_: string[]): Promise<void> {
  const yargs = (await import('yargs')).default;
  const { userCommand } = await import('../../src/commands/user.js');
  await yargs(['user', ...arguments_])
    .command(userCommand)
    .option('json', { type: 'boolean', default: false })
    .option('verbose', { type: 'boolean', default: false })
    .option('insecure', { type: 'boolean', default: false })
    .option('server', { type: 'string' })
    .fail(false)
    .parse();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RBAC command committed outcomes', () => {
  it('uses the authoritative role from an update result', async () => {
    roles.update.mockResolvedValue({ role, ...reduction });

    await invokeApp(['role', 'update', 'app-1', role.id, '--name', 'Billing Reader']);

    expect(success).toHaveBeenCalledWith(`Role updated: ${role.name}`);
    expect(warn).toHaveBeenCalledWith('Authenticate again before the next command.');
  });

  it('prints a role deletion result as JSON', async () => {
    roles.get.mockResolvedValue(role);
    roles.delete.mockResolvedValue(reduction);

    await invokeApp(['role', 'delete', 'app-1', role.id, '--json']);

    expect(printJson).toHaveBeenCalledWith(reduction);
    expect(success).not.toHaveBeenCalled();
  });

  it('prints a role-permission removal result as JSON', async () => {
    roles.removePermissions.mockResolvedValue(reduction);

    await invokeApp(['role', 'remove-perm', 'app-1', role.id, permission.id, '--json']);

    expect(printJson).toHaveBeenCalledWith(reduction);
  });

  it('updates permission metadata through the conventional command', async () => {
    permissions.update.mockResolvedValue(permission);

    await invokeApp(['permission', 'update', 'app-1', permission.id, '--name', permission.name]);

    expect(permissions.update).toHaveBeenCalledWith('app-1', permission.id, {
      name: permission.name,
      description: undefined,
    });
    expect(success).toHaveBeenCalledWith(`Permission updated: ${permission.name}`);
  });

  it('reports reauthentication after a human-readable permission deletion', async () => {
    permissions.get.mockResolvedValue(permission);
    permissions.delete.mockResolvedValue(reduction);

    await invokeApp(['permission', 'delete', 'app-1', permission.id]);

    expect(success).toHaveBeenCalledWith(
      `Permission deleted: ${permission.name} (${permission.slug})`,
    );
    expect(warn).toHaveBeenCalledWith('Authenticate again before the next command.');
  });

  it('reports reauthentication after a human-readable user-role removal', async () => {
    userRoles.remove.mockResolvedValue(reduction);

    await invokeUser(['roles', 'remove', 'user-1', '--org', 'org-1', '--role', role.id]);

    expect(success).toHaveBeenCalledWith(`Role ${role.id} removed from user user-1`);
    expect(warn).toHaveBeenCalledWith('Authenticate again before the next command.');
  });
});
