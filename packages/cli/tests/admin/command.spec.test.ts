/**
 * Public command-boundary specifications for interactive administration.
 */

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clientFactory = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('../../src/credential-store.js', () => ({
  loadCredentials: vi.fn(),
}));
vi.mock('../../src/client-factory.js', () => ({
  createClient: clientFactory.createClient,
}));

import { loadCredentials } from '../../src/credential-store.js';
import { normalizeServerOrigin, resolveServerUrl } from '../../src/global-options.js';

const baseArguments = {
  json: false,
  verbose: false,
  insecure: false,
  force: false,
  _: ['admin'],
  $0: 'porta',
};

/** Creates observable command dependencies without constructing a terminal host. */
function commandDependencies(overrides: Record<string, unknown> = {}) {
  return {
    stdinIsTTY: true,
    stdoutIsTTY: true,
    writeStderr: vi.fn(),
    runApplication: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

/** Creates a valid stored credential fixture for origin resolution. */
function storedCredentials(server: string) {
  return {
    server,
    orgSlug: 'porta-admin',
    clientId: 'porta-cli',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    idToken: 'id-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    userInfo: { sub: 'subject-1', email: 'admin@example.test' },
  };
}

describe('admin command surface', () => {
  const originalPortaServer = process.env.PORTA_SERVER;
  const originalTlsRejection = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PORTA_SERVER;
    vi.mocked(loadCredentials).mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalPortaServer === undefined) {
      delete process.env.PORTA_SERVER;
    } else {
      process.env.PORTA_SERVER = originalPortaServer;
    }
    if (originalTlsRejection === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsRejection;
    }
  });

  it('should expose porta admin when inspecting the command module', async () => {
    const { adminCommand } = await import('../../src/commands/admin.js');

    expect(adminCommand.command).toBe('admin');
    expect(adminCommand.describe).toBeTruthy();
  });

  it('should omit the retired gui command and loader when inspecting CLI source', async () => {
    const entryPath = resolve(import.meta.dirname, '../../src/index.ts');
    const retiredCommandPath = resolve(import.meta.dirname, '../../src/commands/gui.ts');
    const entrySource = await readFile(entryPath, 'utf8');

    expect(entrySource).not.toMatch(/guiCommand|commands\/gui|\.command\(['"]gui['"]/);
    expect(entrySource).not.toContain('@portaidentity/admin-gui');
    await expect(access(retiredCommandPath)).rejects.toThrow();
  });

  it.each([
    { stdinIsTTY: false, stdoutIsTTY: true },
    { stdinIsTTY: true, stdoutIsTTY: false },
  ])(
    'should reject before application construction when stdin or stdout is not a TTY',
    async (terminal) => {
      const { runAdminCommand } = await import('../../src/commands/admin.js');
      const dependencies = commandDependencies(terminal);

      const status = await runAdminCommand(baseArguments, dependencies);

      expect(status).toBe(2);
      expect(dependencies.runApplication).not.toHaveBeenCalled();
      expect(dependencies.writeStderr).toHaveBeenCalledOnce();
      const message = dependencies.writeStderr.mock.calls[0]?.[0];
      expect(message).toMatch(/terminal|TTY/i);
      expect(message.length).toBeLessThanOrEqual(160);
    },
  );

  it.each([{ json: true }, { force: true }])(
    'should reject before partial terminal output when an incompatible global mode is enabled',
    async (mode) => {
      const { runAdminCommand } = await import('../../src/commands/admin.js');
      const dependencies = commandDependencies();

      const status = await runAdminCommand({ ...baseArguments, ...mode }, dependencies);

      expect(status).toBe(2);
      expect(dependencies.runApplication).not.toHaveBeenCalled();
      expect(dependencies.writeStderr).toHaveBeenCalledOnce();
    },
  );

  it('should carry a persistent warning into the application when insecure HTTPS is explicit', async () => {
    const { runAdminCommand } = await import('../../src/commands/admin.js');
    const dependencies = commandDependencies();

    const status = await runAdminCommand(
      {
        ...baseArguments,
        server: 'https://PORTA.example.test:443/',
        insecure: true,
      },
      dependencies,
    );

    expect(status).toBe(0);
    expect(dependencies.runApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        server: new URL('https://porta.example.test/'),
        insecure: true,
        showInsecureWarning: true,
      }),
    );
  });

  it('should suppress only the redundant Node insecure-TLS warning while the TUI is active', async () => {
    const { runAdminCommand } = await import('../../src/commands/admin.js');
    const forwardedWarnings: Array<string | Error> = [];
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = vi.fn((warning: string | Error) => {
      forwardedWarnings.push(warning);
    });
    const dependencies = commandDependencies({
      runApplication: vi.fn(async () => {
        process.emitWarning(
          "Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification.",
        );
        process.emitWarning('unrelated runtime warning');
        return 0;
      }),
    });

    try {
      expect(
        await runAdminCommand(
          { ...baseArguments, server: 'https://porta.example.test', insecure: true },
          dependencies,
        ),
      ).toBe(0);
      expect(forwardedWarnings).toEqual(['unrelated runtime warning']);
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  });

  it('should never permit insecure mode to admit an HTTP origin', async () => {
    const { runAdminCommand } = await import('../../src/commands/admin.js');
    const dependencies = commandDependencies();

    const status = await runAdminCommand(
      {
        ...baseArguments,
        server: 'http://porta.example.test',
        insecure: true,
      },
      dependencies,
    );

    expect(status).toBe(2);
    expect(dependencies.runApplication).not.toHaveBeenCalled();
  });

  it('should resolve server origin by flag then environment then stored credentials', () => {
    process.env.PORTA_SERVER = 'https://environment.example.test';
    vi.mocked(loadCredentials).mockReturnValue(
      storedCredentials('https://credentials.example.test'),
    );

    expect(
      resolveServerUrl({
        ...baseArguments,
        server: 'https://flag.example.test/',
      }),
    ).toBe('https://flag.example.test');
    expect(resolveServerUrl(baseArguments)).toBe('https://environment.example.test');

    delete process.env.PORTA_SERVER;
    expect(resolveServerUrl(baseArguments)).toBe('https://credentials.example.test');
  });

  it('should require explicit server selection when every configured source is absent', () => {
    expect(() => resolveServerUrl(baseArguments)).toThrow(/No Porta server configured/);
  });

  it('should let the application own first-run server selection when no source exists', async () => {
    const { runAdminCommand } = await import('../../src/commands/admin.js');
    const dependencies = commandDependencies();

    const status = await runAdminCommand(baseArguments, dependencies);

    expect(status).toBe(0);
    expect(dependencies.runApplication).toHaveBeenCalledWith(
      expect.objectContaining({ server: undefined, prepareSession: expect.any(Function) }),
    );
    expect(dependencies.writeStderr).not.toHaveBeenCalled();
  });

  it('should report only a bounded message when application startup fails', async () => {
    const { runAdminCommand } = await import('../../src/commands/admin.js');
    const dependencies = commandDependencies({
      runApplication: vi.fn().mockRejectedValue(new Error('/private/path secret-token stack')),
    });

    const status = await runAdminCommand(
      { ...baseArguments, server: 'https://porta.example.test' },
      dependencies,
    );

    expect(status).toBe(1);
    expect(dependencies.writeStderr).toHaveBeenCalledWith('Unable to start Porta administration.');
    expect(dependencies.writeStderr.mock.calls.flat().join(' ')).not.toMatch(
      /private|secret-token|stack/,
    );
  });

  it.each([
    'http://porta.example.test',
    'https://user:password@porta.example.test',
    'https://porta.example.test/admin',
    'https://porta.example.test?mode=admin',
    'https://porta.example.test#admin',
    'https://',
  ])(
    'should reject locally before credential or application use when origin is %s',
    async (server) => {
      const { runAdminCommand } = await import('../../src/commands/admin.js');
      const dependencies = commandDependencies();
      const networkRequest = vi.fn();
      vi.stubGlobal('fetch', networkRequest);

      const status = await runAdminCommand({ ...baseArguments, server }, dependencies);

      expect(status).toBe(2);
      expect(loadCredentials).not.toHaveBeenCalled();
      expect(networkRequest).not.toHaveBeenCalled();
      expect(dependencies.runApplication).not.toHaveBeenCalled();
    },
  );

  it('should accept and normalize a clean HTTPS origin when validating locally', () => {
    expect(normalizeServerOrigin('https://PORTA.example.test:443/')).toEqual(
      new URL('https://porta.example.test/'),
    );
  });

  it('should lazily share one normalized SDK client across organization and user providers', async () => {
    // Command startup and verification do not create an SDK client; the first verified request binds the selected origin.
    const { runAdminCommand } = await import('../../src/commands/admin.js');
    const listAll = vi.fn().mockResolvedValue([]);
    const listUsers = vi
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    clientFactory.createClient.mockReturnValue({
      organizations: { listAll, create: vi.fn() },
      users: { list: listUsers },
    });
    const runApplication = vi.fn(async (options) => {
      expect(clientFactory.createClient).not.toHaveBeenCalled();
      const prepared = options.prepareSession(new URL('https://SELECTED.example.test:443/'), {
        presentAuthorizationUrl: vi.fn(),
        requestManualCallback: vi.fn(),
        confirmCredentialReplacement: vi.fn(),
      });

      expect(clientFactory.createClient).not.toHaveBeenCalled();
      await prepared.session.organizations.listAll();
      expect(clientFactory.createClient).toHaveBeenCalledOnce();
      expect(clientFactory.createClient).toHaveBeenCalledWith({
        ...baseArguments,
        server: 'https://selected.example.test',
      });
      expect(listAll).toHaveBeenCalledOnce();
      await prepared.session.users.list('11111111-1111-4111-8111-111111111111', { page: 1 });
      expect(clientFactory.createClient).toHaveBeenCalledOnce();
      expect(listUsers).toHaveBeenCalledOnce();
      return 0;
    });
    const dependencies = commandDependencies({ runApplication });

    await expect(runAdminCommand(baseArguments, dependencies)).resolves.toBe(0);
  });
});
