import { beforeEach, describe, expect, it, vi } from 'vitest';

const role = {
  id: 'role-1',
  applicationId: 'app-1',
  name: 'Billing Reader',
  slug: 'billing-reader',
  description: null,
  createdAt: '2026-09-09T10:00:00.000Z',
  updatedAt: '2026-09-09T10:00:00.000Z',
};

const permission = {
  id: 'permission-1',
  applicationId: 'app-1',
  moduleId: null,
  name: 'Read invoices',
  slug: 'billing:invoice:read',
  description: null,
  createdAt: '2026-09-09T10:00:00.000Z',
};

const roles = {
  list: vi.fn(),
};

const permissions = {
  list: vi.fn(),
};

const userRoles = {
  list: vi.fn(),
  assign: vi.fn(),
  remove: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({
    roles,
    permissions,
    userRoles,
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
  info: vi.fn(),
  formatDate: vi.fn((value: string) => value),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
}));

import { info, printJson, printTable, success } from '../../src/output.js';

/** Invoke one application child command through the production command tree. */
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

/** Invoke one user child command through the production command tree. */
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

describe('conventional RBAC list commands', () => {
  // Conventional list commands must consume complete arrays without invented pagination.
  it('renders the complete role array without page arguments or a false total', async () => {
    roles.list.mockResolvedValue([role]);

    await invokeApp(['role', 'list', 'app-1', '--json']);

    expect(roles.list).toHaveBeenCalledWith('app-1');
    expect(printJson).toHaveBeenCalledWith([role]);
    expect(info).not.toHaveBeenCalled();
  });

  it('renders the complete permission array without page arguments or a false total', async () => {
    permissions.list.mockResolvedValue([permission]);

    await invokeApp(['permission', 'list', 'app-1']);

    expect(permissions.list).toHaveBeenCalledWith('app-1');
    expect(printTable).toHaveBeenCalledWith(
      ['ID', 'Name', 'Slug', 'Created'],
      [[permission.id, permission.name, permission.slug, permission.createdAt]],
    );
    expect(info).not.toHaveBeenCalled();
  });
});

describe('conventional user-role mutation commands', () => {
  // One CLI selection must be wrapped for the SDK collection mutation contract.
  it('wraps one selected role for the collection assignment contract', async () => {
    userRoles.assign.mockResolvedValue(undefined);

    await invokeUser(['roles', 'assign', 'user-1', '--org', 'org-1', '--role', 'role-1']);

    expect(userRoles.assign).toHaveBeenCalledWith('org-1', 'user-1', ['role-1']);
    expect(success).toHaveBeenCalledWith(expect.stringContaining('assigned'));
  });

  it('prints the committed removal result in JSON', async () => {
    const result = { reauthenticationRequired: true };
    userRoles.remove.mockResolvedValue(result);

    await invokeUser(['roles', 'remove', 'user-1', '--org', 'org-1', '--role', 'role-1', '--json']);

    expect(userRoles.remove).toHaveBeenCalledWith('org-1', 'user-1', ['role-1']);
    expect(printJson).toHaveBeenCalledWith(result);
  });
});
