import { beforeEach, describe, expect, it, vi } from 'vitest';

const promptState = vi.hoisted(() => ({
  answer: 'n',
  rendered: [] as string[],
}));

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    close: vi.fn(),
    question: (prompt: string, callback: (answer: string) => void) => {
      promptState.rendered.push(prompt);
      callback(promptState.answer);
    },
  })),
}));

const organizations = { get: vi.fn(), delete: vi.fn(), archive: vi.fn(), destroy: vi.fn() };
const applications = {
  get: vi.fn(),
  listModules: vi.fn(),
  delete: vi.fn(),
  deleteModule: vi.fn(),
  archive: vi.fn(),
};
const clients = { get: vi.fn(), delete: vi.fn(), revoke: vi.fn(), revokeSecret: vi.fn() };
const roles = { get: vi.fn(), delete: vi.fn(), archive: vi.fn(), remove: vi.fn() };
const permissions = { get: vi.fn(), delete: vi.fn(), archive: vi.fn() };
const customClaims = { get: vi.fn(), delete: vi.fn(), archive: vi.fn() };
const users = { get: vi.fn(), delete: vi.fn(), purge: vi.fn() };

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({
    organizations,
    applications,
    clients,
    roles,
    permissions,
    customClaims,
    users,
  })),
}));

vi.mock('../../src/error-handler.js', () => ({ handleError: vi.fn() }));

vi.mock('../../src/output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/output.js')>();
  return {
    ...actual,
    printTable: vi.fn(),
    printJson: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    formatDate: vi.fn((value: string | Date | null | undefined) => String(value ?? 'N/A')),
    truncate: vi.fn((value: string) => value),
  };
});

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const ROLE_ID = '55555555-5555-4555-8555-555555555555';
const PERMISSION_ID = '66666666-6666-4666-8666-666666666666';
const CLAIM_ID = '77777777-7777-4777-8777-777777777777';
const USER_ID = '88888888-8888-4888-8888-888888888888';

const organization = {
  id: ORGANIZATION_ID,
  name: 'Example Organization',
  slug: 'example-organization',
};
const application = { id: APPLICATION_ID, name: 'Payments', slug: 'payments' };
const applicationModule = {
  id: MODULE_ID,
  applicationId: APPLICATION_ID,
  name: 'Billing',
  slug: 'billing',
};
const oidcClient = {
  id: CLIENT_ID,
  clientId: 'porta_client',
  clientName: 'Web client',
};
const role = { id: ROLE_ID, name: 'Administrator', slug: 'administrator' };
const permission = { id: PERMISSION_ID, name: 'Read invoices', slug: 'read-invoices' };
const claim = { id: CLAIM_ID, name: 'Cost centre', slug: 'cost-centre' };
const user = {
  id: USER_ID,
  organizationId: ORGANIZATION_ID,
  email: 'person@example.test',
  givenName: 'Example',
  familyName: 'Person',
};

type CliFamily = 'org' | 'app' | 'client' | 'user';
type CliValue = string | boolean | undefined;

/** Execute one conventional command through the same strict yargs boundary as the CLI. */
async function invoke(
  family: CliFamily,
  command: readonly string[],
  options: Record<string, CliValue> = {},
): Promise<void> {
  const yargs = (await import('yargs')).default;
  const commandModule =
    family === 'org'
      ? (await import('../../src/commands/org.js')).orgCommand
      : family === 'app'
        ? (await import('../../src/commands/app.js')).appCommand
        : family === 'client'
          ? (await import('../../src/commands/client.js')).clientCommand
          : (await import('../../src/commands/user.js')).userCommand;
  const args = [family, ...command];

  for (const [name, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (typeof value === 'boolean') {
      if (value) args.push(`--${name}`);
    } else {
      args.push(`--${name}`, value);
    }
  }

  try {
    await yargs(args)
      .command(commandModule)
      .option('json', { type: 'boolean', default: false })
      .option('verbose', { type: 'boolean', default: false })
      .option('insecure', { type: 'boolean', default: false })
      .option('force', { type: 'boolean', default: false })
      .option('server', { type: 'string' })
      .strict()
      .exitProcess(false)
      .fail(false)
      .parse();
  } catch {
    // Invalid or removed argv must stop before a resource mutation is dispatched.
  }
}

/** Render help for one command scope without writing it to the test process output. */
async function commandHelp(family: CliFamily, command: readonly string[] = []): Promise<string> {
  const yargs = (await import('yargs')).default;
  const commandModule =
    family === 'org'
      ? (await import('../../src/commands/org.js')).orgCommand
      : family === 'app'
        ? (await import('../../src/commands/app.js')).appCommand
        : family === 'client'
          ? (await import('../../src/commands/client.js')).clientCommand
          : (await import('../../src/commands/user.js')).userCommand;

  return new Promise((resolve) => {
    yargs()
      .command(commandModule)
      .option('force', { type: 'boolean', default: false })
      .help()
      .exitProcess(false)
      .parse([family, ...command, '--help'], (_error, _argv, output) => resolve(output));
  });
}

type DeletionCase = {
  label: string;
  family: CliFamily;
  command: readonly string[];
  name: string;
  remove: ReturnType<typeof vi.fn>;
  expectedArgs: readonly string[];
};

const deletionCases: DeletionCase[] = [
  {
    label: 'organization',
    family: 'org',
    command: ['delete', ORGANIZATION_ID],
    name: organization.name,
    remove: organizations.delete,
    expectedArgs: [ORGANIZATION_ID],
  },
  {
    label: 'application',
    family: 'app',
    command: ['delete', APPLICATION_ID],
    name: application.name,
    remove: applications.delete,
    expectedArgs: [APPLICATION_ID],
  },
  {
    label: 'module',
    family: 'app',
    command: ['module', 'delete', APPLICATION_ID, MODULE_ID],
    name: applicationModule.name,
    remove: applications.deleteModule,
    expectedArgs: [APPLICATION_ID, MODULE_ID],
  },
  {
    label: 'client',
    family: 'client',
    command: ['delete', CLIENT_ID],
    name: oidcClient.clientName,
    remove: clients.delete,
    expectedArgs: [CLIENT_ID],
  },
  {
    label: 'role',
    family: 'app',
    command: ['role', 'delete', APPLICATION_ID, ROLE_ID],
    name: role.name,
    remove: roles.delete,
    expectedArgs: [APPLICATION_ID, ROLE_ID],
  },
  {
    label: 'permission',
    family: 'app',
    command: ['permission', 'delete', APPLICATION_ID, PERMISSION_ID],
    name: permission.name,
    remove: permissions.delete,
    expectedArgs: [APPLICATION_ID, PERMISSION_ID],
  },
  {
    label: 'claim',
    family: 'app',
    command: ['claim', 'delete', APPLICATION_ID, CLAIM_ID],
    name: claim.name,
    remove: customClaims.delete,
    expectedArgs: [APPLICATION_ID, CLAIM_ID],
  },
  {
    label: 'user',
    family: 'user',
    command: ['delete', ORGANIZATION_ID, USER_ID],
    name: `${user.givenName} ${user.familyName}`,
    remove: users.delete,
    expectedArgs: [ORGANIZATION_ID, USER_ID],
  },
];

describe('record deletion conventional CLI contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptState.answer = 'n';
    promptState.rendered.length = 0;

    organizations.get.mockResolvedValue({ data: organization, etag: 'org-etag' });
    applications.get.mockResolvedValue({ data: application, etag: 'app-etag' });
    applications.listModules.mockResolvedValue([applicationModule]);
    clients.get.mockResolvedValue({ data: oidcClient, etag: 'client-etag' });
    roles.get.mockResolvedValue(role);
    permissions.get.mockResolvedValue(permission);
    customClaims.get.mockResolvedValue(claim);
    users.get.mockResolvedValue({ data: user, etag: 'user-etag' });

    for (const deletion of deletionCases) deletion.remove.mockResolvedValue(undefined);
  });

  it.each(deletionCases)(
    'ST-30 registers $label Delete with Keep as the default and dispatches once only after confirmation',
    async ({ family, command, name, remove, expectedArgs }) => {
      promptState.answer = 'y';

      await invoke(family, command);

      expect(promptState.rendered).toHaveLength(1);
      expect(promptState.rendered[0]).toContain('Keep');
      expect(promptState.rendered[0]).toContain(`Delete ${name}`);
      expect(promptState.rendered[0]).toContain('[y/N]');
      expect(remove).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith(...expectedArgs);
    },
  );

  it.each(deletionCases)(
    'ST-31 does not let --force confirm $label deletion',
    async ({ family, command, remove }) => {
      await invoke(family, command, { force: true });

      expect(promptState.rendered).toHaveLength(1);
      expect(promptState.rendered[0]).toContain('Keep');
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('ST-31 renders a hostile remote name without terminal control bytes', async () => {
    const hostileName = 'unsafe\u001b]52;c;clipboard\u0007 organization';
    organizations.get.mockResolvedValue({
      data: { ...organization, name: hostileName },
      etag: 'org-etag',
    });

    await invoke('org', ['delete', ORGANIZATION_ID]);

    expect(promptState.rendered).toHaveLength(1);
    expect(promptState.rendered[0]).toContain('unsafe�]52;c;clipboard� organization');
    expect([...promptState.rendered[0]!].every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && !(codePoint >= 127 && codePoint <= 159);
    })).toBe(true);
    expect(organizations.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['org', ['archive', ORGANIZATION_ID], organizations.archive],
    ['org', ['destroy', ORGANIZATION_ID], organizations.destroy],
    ['app', ['archive', APPLICATION_ID], applications.archive],
    ['client', ['revoke', CLIENT_ID], clients.revoke],
    ['app', ['role', 'archive', APPLICATION_ID, ROLE_ID], roles.archive],
    ['app', ['permission', 'archive', APPLICATION_ID, PERMISSION_ID], permissions.archive],
    ['app', ['claim', 'archive', APPLICATION_ID, CLAIM_ID], customClaims.archive],
    ['user', ['purge', ORGANIZATION_ID, USER_ID], users.purge],
  ] as const)(
    'ST-29 removes obsolete %s lifecycle command %s from parsing and help',
    async (family, command, obsolete) => {
      promptState.answer = 'y';
      await invoke(family, command);

      expect(obsolete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['org', [], ['archive', 'restore', 'destroy']],
    ['app', [], ['archive']],
    ['app', ['module'], []],
    ['client', [], ['revoke']],
    ['app', ['role'], ['archive']],
    ['app', ['permission'], ['archive']],
    ['app', ['claim'], ['archive']],
    ['user', [], ['purge']],
  ] as const)(
    'ST-29 exposes Delete and removes obsolete lifecycle vocabulary from %s %s help',
    async (family, command, obsoleteWords) => {
      const output = await commandHelp(family, command);

      expect(output).toMatch(/\bdelete\b/i);
      for (const obsolete of obsoleteWords) {
        expect(output).not.toMatch(new RegExp(`\\b${obsolete}\\b`, 'i'));
      }
    },
  );

  it('ST-29 retains nested secret revocation as an artifact operation', async () => {
    promptState.answer = 'y';
    const secretId = '99999999-9999-4999-8999-999999999999';

    await invoke('client', ['secret', 'revoke', CLIENT_ID, secretId]);

    expect(clients.revokeSecret).toHaveBeenCalledOnce();
    expect(clients.revokeSecret).toHaveBeenCalledWith(CLIENT_ID, secretId);
  });
});
