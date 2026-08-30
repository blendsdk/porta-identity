/**
 * Public behavior specifications for the embedded terminal administration shell.
 */

import { defaultTheme } from '@jsvision/core';
import { createApplication } from '@jsvision/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAdminApplication } from '../../src/admin/application.js';
import type { AdminConnectionState } from '../../src/admin/state.js';

const server = new URL('https://PORTA.example.test:443/');
const verifiedIdentity = {
  sub: 'subject-1',
  email: 'admin@example.test',
  name: 'Verified Admin',
};
const noOrganizationCapabilities = {
  canReadOrganizations: false,
  canCreateOrganizations: false,
};
const terminalCapabilities = vi.hoisted(() => ({ utf8: true }));

vi.mock('@jsvision/core', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveCapabilities: (...args: []) => {
      const resolution = original.resolveCapabilities(...args);
      return {
        ...resolution,
        profile: {
          ...resolution.profile,
          unicode: { ...resolution.profile.unicode, utf8: terminalCapabilities.utf8 },
        },
      };
    },
  };
});

/** Reads the visible text from the real JSVision frame buffer. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Allows promise continuations and their coalesced render to complete. */
async function settleApplication(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

/** Sends one decoded keyboard event through the real JSVision loop. */
function press(
  application: ReturnType<typeof createApplication>,
  key: string,
  modifiers: { alt?: boolean } = {},
): void {
  application.loop.dispatch({
    type: 'key',
    key,
    ctrl: false,
    alt: modifiers.alt ?? false,
    shift: false,
    ...(key.length === 1 ? { codepoint: key.codePointAt(0) } : {}),
  });
}

/** Creates an authenticated state using only live-verified display claims. */
function authenticatedState(
  identity = verifiedIdentity,
  organization?: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly status: 'active' | 'suspended' | 'archived';
  },
): AdminConnectionState {
  return {
    kind: 'authenticated',
    server,
    identity,
    capabilities: noOrganizationCapabilities,
    ...(organization ? { organization } : {}),
  };
}

beforeEach(() => {
  terminalCapabilities.utf8 = true;
});

describe('admin application shell', () => {
  // The main surface is the ordinary JSVision desktop; session details live in dialogs, not the body.
  it('should retain the authenticated foundation invariants at 80x24', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const buffer = application.loop.renderRoot.buffer();
        const frame = frameText(application);

        expect(buffer.get(0, 1)?.char).toBe(defaultTheme.desktop.pattern);
        expect(buffer.get(0, 1)?.bg).toBe(defaultTheme.desktop.bg);
        expect(buffer.get(2, 1)?.char).toBe(defaultTheme.desktop.pattern);
        expect(buffer.get(2, 1)?.bg).toBe(defaultTheme.desktop.bg);
        expect(frame).not.toContain('https://porta.example.test');
        expect(frame).not.toContain('Authenticated');
        expect(frame).not.toContain('Porta Administration');
        press(application, 'f10');
        await settleApplication();
        expect(frameText(application)).toMatch(/Who am I(?:…|\.\.\.)/);
        return 0;
      },
    });
  });

  // Authenticated navigation stays in the menus without duplicating organization state in the body.
  it('should render UTF-8 navigation and an unselected organization landing at 80x24', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const landing = frameText(application);

        expect(landing.split('\n')[0]).toContain('≡');
        expect(landing.split('\n')[0]).not.toContain('F10');
        expect(landing).not.toContain('☰ Menu');
        expect(landing).toContain('Organizations');
        expect(landing).not.toContain('Choose or create an organization.');
        expect(landing).not.toContain('Verified Admin');
        expect(landing).not.toContain('admin@example.test');
        expect(landing).toContain('Users');
        expect(landing).toContain('Applications');
        expect(landing).not.toMatch(/Signing Keys|Dashboard|Metrics/);

        press(application, 'f10');
        await settleApplication();
        const menu = frameText(application);
        expect(menu).toMatch(/Who am I(?:…|\.\.\.)/);
        expect(menu).toContain('Reauthenticate');
        expect(menu).toContain('Quit');
        return 0;
      },
    });
  });

  // Terminals without usable UTF-8 receive a compact ASCII hamburger approximation.
  it('should render an ASCII hamburger label without the word Menu', async () => {
    terminalCapabilities.utf8 = false;

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const frame = frameText(application);

        expect(frame.split('\n')[0]).toContain('[=]');
        expect(frame.split('\n')[0]).not.toContain('Menu');
        expect(frame).not.toContain('≡');
        expect(frame).toContain('Organizations');
        return 0;
      },
    });
  });

  // Capability-gated organization actions remain discoverable and explain why they cannot run.
  it('should show fixed disabled reasons in the Organizations menu', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        press(application, 'o', { alt: true });
        await settleApplication();
        const frame = frameText(application);

        expect(frame).toMatch(/Create organization(?:…|\.\.\.) \(requires organization create\)/);
        expect(frame).toMatch(/Switch organization(?:…|\.\.\.) \(requires organization read\)/);
        return 0;
      },
    });
  });

  it.each([
    ['enter', false],
    ['escape', true],
  ])('should route Who am I and restore focus after %s', async (closingKey, insecure) => {
    // Real menu routing opens trusted identity details, applies the TLS warning condition, and restores prior focus.
    await runAdminApplication({
      server,
      insecure,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        press(application, 'f10');
        press(application, 'enter');
        await settleApplication();
        const modal = frameText(application);

        expect(modal).toContain('https://porta.example.test');
        expect(modal).toContain('Authenticated');
        expect(modal).toContain('Verified Admin');
        expect(modal).toContain('admin@example.test');
        expect(modal.toLowerCase().includes('insecure tls')).toBe(insecure);

        press(application, closingKey);
        await settleApplication();
        expect(application.loop.getFocused()).not.toBeNull();
        expect(frameText(application)).not.toContain('admin@example.test');
        return 0;
      },
    });
  });

  it('should quit cleanly with Alt-X while a dialog is open', async () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        initialState: authenticatedState(),
        applicationFactory: createApplication,
        applicationRunner: async (application) => {
          press(application, 'f10');
          press(application, 'enter');
          await settleApplication();
          expect(frameText(application)).toContain('Who am I');

          press(application, 'x', { alt: true });
          await settleApplication();

          expect(warnings).not.toHaveBeenCalledWith(
            expect.stringContaining("the command 'quit' was emitted but no view handled it"),
          );
          return 0;
        },
      });
    } finally {
      warnings.mockRestore();
    }
  });

  it.each([
    [80, 24],
    [48, 12],
  ])(
    'should keep selected organization context out of the landing body at %ix%i',
    async (width, height) => {
      // Organization context drives the menus but is not duplicated on the blank landing surface.
      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width, height },
        initialState: authenticatedState(verifiedIdentity, {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Selected Organization',
          slug: 'selected-organization',
          status: 'suspended',
        }),
        applicationFactory: createApplication,
        applicationRunner: async (application) => {
          const frame = frameText(application);

          expect(frame).not.toContain('Selected Organization');
          expect(frame).not.toContain('selected-organization');
          expect(frame).not.toContain('suspended');
          expect(frame).not.toContain('porta.example.test');
          expect(frame).not.toContain('Verified Admin');
          expect(frame).not.toContain('admin@example.test');
          expect(frame).toContain('Users');
          if (width >= 80) {
            expect(frame).toContain('Applications');
          }
          expect(frame).not.toMatch(/Dashboard|Metrics|Signing Keys/);
          expect(frame.length).toBeLessThanOrEqual(width * height + height - 1);
          return 0;
        },
      });
    },
  );

  // Security and identity details remain available from Who am I at compact usable geometry.
  it('should keep required actions and warning details available when the viewport is 48x12', async () => {
    await runAdminApplication({
      server,
      insecure: true,
      viewport: { width: 48, height: 12 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        press(application, 'f10');
        press(application, 'enter');
        await settleApplication();
        const frame = frameText(application);
        const plainAscii = frame.replace(/[^\x20-\x7e\n]/g, '');

        expect(plainAscii).toContain('porta.example.test');
        expect(plainAscii).toMatch(/Authenticated/i);
        expect(plainAscii).toMatch(/Reauth/i);
        expect(plainAscii).toMatch(/Quit/i);
        expect(plainAscii).toMatch(/insecure/i);
        return 0;
      },
    });
  });

  // An undersized terminal degrades to bounded resize guidance while keeping Quit reachable.
  it('should render only resize guidance and quit when geometry is below the recoverable size', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 24, height: 6 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const frame = frameText(application);

        expect(frame.length).toBeLessThanOrEqual(24 * 6 + 5);
        expect(frame).toMatch(/resize|larger terminal/i);
        expect(frame).toMatch(/Quit/i);
        expect(application.loop.isCommandEnabled('quit')).toBe(true);
        expect(frame).not.toContain('admin@example.test');
        expect(frame).not.toContain('https://porta.example.test');
        expect(frame).not.toContain('Session');
        return 0;
      },
    });
  });

  // An unauthenticated action delegates to the shared cancellable session flow.
  it('should authenticate through the shared session capability when no verified session exists', async () => {
    const authenticate = vi.fn().mockResolvedValue(authenticatedState());

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      session: { authenticate },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        await settleApplication();
        expect(frameText(application)).toContain('Authenticate');

        press(application, 'enter');
        await settleApplication();

        expect(authenticate).toHaveBeenCalledOnce();
        expect(authenticate.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
        expect(frameText(application)).not.toContain('admin@example.test');
        press(application, 'f10');
        press(application, 'enter');
        await settleApplication();
        expect(frameText(application)).toContain('admin@example.test');
        press(application, 'escape');
        application.loop.emitCommand('quit');
        return 0;
      },
    });
  });

  // Reauthentication cannot replace a live identity until the shared coordinator confirms success.
  it('should replace displayed identity only when reauthentication completes successfully', async () => {
    let completeReauthentication: ((state: AdminConnectionState) => void) | undefined;
    const reauthenticate = vi.fn(
      () =>
        new Promise<AdminConnectionState>((resolve) => {
          completeReauthentication = resolve;
        }),
    );

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(),
      session: { reauthenticate },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand('reauthenticate');
        await settleApplication();

        expect(reauthenticate).toHaveBeenCalledOnce();
        expect(frameText(application)).not.toContain('admin@example.test');
        expect(frameText(application)).not.toContain('replacement@example.test');

        completeReauthentication?.(
          authenticatedState({
            sub: 'subject-2',
            email: 'replacement@example.test',
            name: 'Replacement Admin',
          }),
        );
        await settleApplication();

        press(application, 'f10');
        press(application, 'enter');
        await settleApplication();
        expect(frameText(application)).toContain('replacement@example.test');
        expect(frameText(application)).not.toContain('admin@example.test');
        press(application, 'escape');
        return 0;
      },
    });
  });

  // Quit aborts only the current operation, finalizes once, and rejects its late state update.
  it('should ignore a late operation result when cancellation and quit dispose the application', async () => {
    let operationSignal: AbortSignal | undefined;
    let finishAuthentication: ((state: AdminConnectionState) => void) | undefined;
    const authenticate = vi.fn(
      (signal: AbortSignal) =>
        new Promise<AdminConnectionState>((resolve) => {
          operationSignal = signal;
          finishAuthentication = resolve;
        }),
    );
    const applicationFinalizer = vi.fn((application: ReturnType<typeof createApplication>) => {
      application.loop.dispose();
    });
    let disposedApplication: ReturnType<typeof createApplication> | undefined;

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      session: { authenticate },
      applicationFactory: createApplication,
      applicationFinalizer,
      applicationRunner: async (application) => {
        disposedApplication = application;
        application.loop.emitCommand('authenticate');
        await settleApplication();
        application.loop.emitCommand('cancel');
        application.loop.emitCommand('quit');
        return 0;
      },
    });

    expect(operationSignal?.aborted).toBe(true);
    expect(applicationFinalizer).toHaveBeenCalledOnce();

    finishAuthentication?.(authenticatedState());
    await settleApplication();
    expect(applicationFinalizer).toHaveBeenCalledOnce();
    expect(disposedApplication && frameText(disposedApplication)).not.toContain(
      'admin@example.test',
    );
  });

  // Remote failure text is untrusted and cannot cross the allowlisted presentation boundary.
  it('should render only a bounded allowlisted category when remote failure detail is hostile', async () => {
    const attackerDetail = [
      'Bearer secret-access-token',
      '/home/operator/.porta/credentials.json',
      'Error: remote stack at internal.ts:42',
      '<html>raw upstream body</html>',
      'x'.repeat(20_000),
    ].join('\n');
    const authenticate = vi.fn().mockRejectedValue(new Error(attackerDetail));

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      session: { authenticate },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand('authenticate');
        await settleApplication();
        const frame = frameText(application);

        expect(frame).toContain('Authentication required');
        expect(frame).not.toContain('secret-access-token');
        expect(frame).not.toContain('/home/operator');
        expect(frame).not.toContain('internal.ts');
        expect(frame).not.toContain('raw upstream body');
        expect(frame.length).toBeLessThanOrEqual(80 * 24 + 23);
        return 0;
      },
    });
  });

  it('should keep Users visible but unavailable until an organization is selected', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: {
        ...authenticatedState(),
        capabilities: {
          ...noOrganizationCapabilities,
          canReadUsers: true,
          canCreateUsers: true,
          canInviteUsers: true,
          canUpdateUsers: true,
          canManageUserLifecycle: true,
          canPurgeUsers: true,
        },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        expect(frameText(application)).toContain('Users');
        const browse = vi.fn();
        application.onCommand('browse-users', browse);
        press(application, 'u', { alt: true });
        press(application, 'enter');
        expect(browse).not.toHaveBeenCalled();
        return 0;
      },
    });
  });

  it.each([
    ['create', 'create-user', 'c'],
    ['invite', 'invite-user', 'i'],
    ['read', 'browse-users', 'b'],
  ])(
    'should emit only the independently authorized %s user command',
    async (capability, command, hotkey) => {
      const userCapabilities = {
        ...noOrganizationCapabilities,
        canReadUsers: capability === 'read',
        canCreateUsers: capability === 'create',
        canInviteUsers: capability === 'invite',
        canUpdateUsers: false,
        canManageUserLifecycle: false,
        canPurgeUsers: false,
      };
      const calls: string[] = [];

      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        initialState: {
          ...authenticatedState(verifiedIdentity, {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Selected Organization',
            slug: 'selected-organization',
            status: 'active',
          }),
          capabilities: userCapabilities,
        },
        applicationFactory: createApplication,
        applicationRunner: async (application) => {
          for (const candidate of ['browse-users', 'create-user', 'invite-user']) {
            application.onCommand(candidate, () => calls.push(candidate));
          }
          press(application, 'u', { alt: true });
          await settleApplication();
          expect(frameText(application)).toContain('Users');
          press(application, hotkey);
          expect(calls).toEqual([command]);
          return 0;
        },
      });
    },
  );
});
