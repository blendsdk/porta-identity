/**
 * Public behavior specifications for the embedded terminal administration shell.
 */

import { defaultTheme } from '@jsvision/core';
import { createApplication } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { runAdminApplication } from '../../src/admin/application.js';
import type { AdminConnectionState } from '../../src/admin/state.js';

const server = new URL('https://PORTA.example.test:443/');
const verifiedIdentity = {
  sub: 'subject-1',
  email: 'admin@example.test',
  name: 'Verified Admin',
};

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
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Creates an authenticated state using only live-verified display claims. */
function authenticatedState(identity = verifiedIdentity): AdminConnectionState {
  return { kind: 'authenticated', server, identity };
}

describe('admin application shell', () => {
  // A normal terminal shows the complete foundation shell and no invented administration module.
  it('should render the authenticated foundation when the viewport is 80x24', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const buffer = application.loop.renderRoot.buffer();
        const frame = frameText(application);

        expect(buffer.get(0, 1)?.bg).toBe(defaultTheme.window.bg);
        expect(buffer.get(2, 1)?.bg).toBe(defaultTheme.window.bg);
        expect(frame).toContain('Application');
        expect(frame).toContain('Quit');
        expect(frame).toContain('Session');
        expect(frame).toContain('Reauthenticate');
        expect(frame).toContain('https://porta.example.test');
        expect(frame).toContain('Authenticated');
        expect(frame).toContain('Verified Admin');
        expect(frame).toContain('admin@example.test');
        expect(frame).toMatch(/shortcut|Alt\+|Ctrl\+/i);
        expect(frame).not.toMatch(
          /Organizations|Applications|Clients|Users|Signing Keys|Audit Log|Dashboard|Metrics/,
        );
        return 0;
      },
    });
  });

  // A compact terminal preserves every required action and conveys security state in plain text.
  it('should keep required state actions and warning text visible when the viewport is 48x12', async () => {
    await runAdminApplication({
      server,
      insecure: true,
      viewport: { width: 48, height: 12 },
      initialState: authenticatedState(),
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
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
        expect(frameText(application)).toContain('Authenticate');

        application.loop.emitCommand('authenticate');
        await settleApplication();

        expect(authenticate).toHaveBeenCalledOnce();
        expect(authenticate.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
        expect(frameText(application)).toContain('admin@example.test');
        application.loop.emitCommand('quit');
        return 0;
      },
    });
  });

  // Retry is offered only for a failure category that the application can safely repeat.
  it('should expose retry only when the classified failure is safely repeatable', async () => {
    const frames: string[] = [];

    for (const initialState of [
      { kind: 'unauthenticated', server, reason: 'unavailable' } as const,
      { kind: 'unauthenticated', server, reason: 'configuration-failure' } as const,
    ]) {
      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 48, height: 12 },
        initialState,
        applicationFactory: createApplication,
        applicationRunner: async (application) => {
          frames.push(frameText(application));
          return 0;
        },
      });
    }

    expect(frames[0]).toContain('Retry');
    expect(frames[1]).not.toContain('Retry');
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
        expect(frameText(application)).toContain('admin@example.test');
        expect(frameText(application)).not.toContain('replacement@example.test');

        completeReauthentication?.(
          authenticatedState({
            sub: 'subject-2',
            email: 'replacement@example.test',
            name: 'Replacement Admin',
          }),
        );
        await settleApplication();

        expect(frameText(application)).toContain('replacement@example.test');
        expect(frameText(application)).not.toContain('admin@example.test');
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

        expect(frame).toMatch(/Unavailable|Authentication failed|Storage failure/);
        expect(frame).not.toContain('secret-access-token');
        expect(frame).not.toContain('/home/operator');
        expect(frame).not.toContain('internal.ts');
        expect(frame).not.toContain('raw upstream body');
        expect(frame.length).toBeLessThanOrEqual(80 * 24 + 23);
        return 0;
      },
    });
  });
});
