/**
 * Consumer contract tests for user commands whose SDK result or arguments are
 * more specific than the general user resource shape.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsers = {
  get: vi.fn(),
  getHistory: vi.fn(),
  invite: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../src/client-factory.js', () => ({
  createClient: vi.fn(() => ({ users: mockUsers })),
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
  formatDate: vi.fn((date: string | null) => date ?? 'N/A'),
  truncate: vi.fn((value: string) => value.slice(0, 8)),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
  question: vi.fn(),
}));

import { printJson, printTable, success, warn } from '../../src/output.js';

const organizationId = 'org-uuid-1234';
const userId = 'user-uuid-1234';
const applicationId = '11111111-1111-4111-8111-111111111111';
const secondApplicationId = '22222222-2222-4222-8222-222222222222';
const roleId = '33333333-3333-4333-8333-333333333333';
const secondRoleId = '44444444-4444-4444-8444-444444444444';

async function invokeUserCommand(
  subcommand: string,
  options: Record<string, string | boolean | string[] | undefined> = {},
): Promise<void> {
  const yargs = (await import('yargs')).default;
  const { userCommand } = await import('../../src/commands/user.js');
  const args = ['user', ...subcommand.split(' ')];

  for (const [name, value] of Object.entries(options)) {
    if (name === '_positionals' || value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) args.push(`--${name}`, item);
    } else if (typeof value === 'boolean') {
      if (value) args.push(`--${name}`);
    } else {
      args.push(`--${name}`, value);
    }
  }

  const positionals = options._positionals;
  if (typeof positionals === 'string') {
    args.splice(1 + subcommand.split(' ').length, 0, positionals);
  }

  try {
    await yargs(args)
      .command(userCommand)
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
    // Invalid command input must stop before the SDK method is called.
  }
}

function presentedValues(): string {
  return JSON.stringify([
    ...(printTable as ReturnType<typeof vi.fn>).mock.calls,
    ...(success as ReturnType<typeof vi.fn>).mock.calls,
  ]);
}

describe('user command SDK contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.get.mockResolvedValue({
      data: {
        id: userId,
        organizationId,
        email: 'current@example.com',
        givenName: 'Current',
        familyName: 'User',
      },
      etag: 'etag-1',
    });
  });

  describe('update', () => {
    it('does not expose an email option or send an email update', async () => {
      await invokeUserCommand('update', {
        org: organizationId,
        _positionals: userId,
        email: 'replacement@example.com',
      });

      expect(mockUsers.get).not.toHaveBeenCalled();
      expect(mockUsers.update).not.toHaveBeenCalled();
    });
  });

  describe('invite', () => {
    const invitation = {
      invitationId: 'invitation-1',
      email: 'invited@example.com',
      invitationSent: false,
      emailDelivery: 'failed',
      expiresAt: '2026-09-01T12:00:00.000Z',
    };

    it('presents the invitation result fields in human-readable output', async () => {
      mockUsers.invite.mockResolvedValue(invitation);

      await invokeUserCommand('invite', {
        org: organizationId,
        email: invitation.email,
      });

      const output = presentedValues();
      expect(output).toContain(invitation.invitationId);
      expect(output).toContain(invitation.email);
      expect(output).toContain('invitationSent');
      expect(output).toContain(invitation.expiresAt);
      expect(output).toContain('false');
      expect(output).not.toContain('User ID');
      expect(output).not.toContain('userId');
    });

    it('prints the invitation result in JSON mode', async () => {
      mockUsers.invite.mockResolvedValue(invitation);

      await invokeUserCommand('invite', {
        org: organizationId,
        email: invitation.email,
        json: true,
      });

      expect(printJson).toHaveBeenCalledWith(invitation);
    });

    it('forwards one role pre-assignment as an exact pair', async () => {
      mockUsers.invite.mockResolvedValue(invitation);

      await invokeUserCommand('invite', {
        org: organizationId,
        email: invitation.email,
        role: [`${applicationId}:${roleId}`],
      });

      expect(mockUsers.invite).toHaveBeenCalledWith({
        organizationId,
        email: invitation.email,
        roles: [{ applicationId, roleId }],
      });
    });

    it('accumulates repeated role flags in order', async () => {
      mockUsers.invite.mockResolvedValue(invitation);

      await invokeUserCommand('invite', {
        org: organizationId,
        email: invitation.email,
        role: [`${applicationId}:${roleId}`, `${secondApplicationId}:${secondRoleId}`],
      });

      expect(mockUsers.invite).toHaveBeenCalledWith({
        organizationId,
        email: invitation.email,
        roles: [
          { applicationId, roleId },
          { applicationId: secondApplicationId, roleId: secondRoleId },
        ],
      });
    });

    it('forwards locale and personal message', async () => {
      mockUsers.invite.mockResolvedValue(invitation);

      await invokeUserCommand('invite', {
        org: organizationId,
        email: invitation.email,
        locale: 'nl',
        'personal-message': 'Welcome to the study',
      });

      expect(mockUsers.invite).toHaveBeenCalledWith({
        organizationId,
        email: invitation.email,
        locale: 'nl',
        personalMessage: 'Welcome to the study',
      });
    });

    it.each([
      'not-a-pair',
      `:${roleId}`,
      `${applicationId}:`,
      `not-a-uuid:${roleId}`,
      `${applicationId}:not-a-uuid`,
      `${applicationId}:${roleId}:extra`,
    ])('rejects malformed role %s before calling the SDK', async (value) => {
      mockUsers.invite.mockResolvedValue(invitation);

      await invokeUserCommand('invite', {
        org: organizationId,
        email: invitation.email,
        role: [value],
      });

      expect(mockUsers.invite).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    const entry = {
      id: 'history-1',
      eventType: 'user.deactivated',
      actorId: 'admin-1',
      metadata: { reason: 'Policy review' },
      createdAt: '2026-08-30T10:00:00.000Z',
    };

    it('renders entries from the history result data', async () => {
      mockUsers.getHistory.mockResolvedValue({ data: [entry] });

      await invokeUserCommand('history', { org: organizationId, _positionals: userId });

      expect(mockUsers.getHistory).toHaveBeenCalledWith(organizationId, userId);
      expect(printTable).toHaveBeenCalled();
      expect(JSON.stringify((printTable as ReturnType<typeof vi.fn>).mock.calls)).toContain(
        entry.id,
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it('prints the full history result envelope in JSON mode', async () => {
      const result = { data: [entry] };
      mockUsers.getHistory.mockResolvedValue(result);

      await invokeUserCommand('history', {
        org: organizationId,
        _positionals: userId,
        json: true,
      });

      expect(printJson).toHaveBeenCalledWith(result);
    });

    it('warns when the history result data is empty', async () => {
      mockUsers.getHistory.mockResolvedValue({ data: [] });

      await invokeUserCommand('history', { org: organizationId, _positionals: userId });

      expect(warn).toHaveBeenCalledWith('No history entries found');
      expect(printTable).not.toHaveBeenCalled();
    });
  });
});
