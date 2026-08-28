/** Implementation-level lifecycle tests for the administration application. */

import { createApplication } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';
import { runAdminApplication, type AdminSignalSource } from '../../src/admin/application.js';
import { adminStateServer, type AdminConnectionState } from '../../src/admin/state.js';

const server = new URL('https://porta.example.test');
const noOrganizationCapabilities = {
  canReadOrganizations: false,
  canCreateOrganizations: false,
};

/** Creates one authenticated implementation-test state. */
function authenticatedState(): AdminConnectionState {
  return {
    kind: 'authenticated',
    server,
    identity: { sub: 'subject-1', email: 'admin@example.test' },
    capabilities: noOrganizationCapabilities,
  };
}

/** Reads plain cell content from a real JSVision application. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Flushes async command continuations and the deferred repaint. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('admin application implementation', () => {
  it('should return a server only for states that carry one', () => {
    expect(adminStateServer({ kind: 'selecting-server' })).toBeUndefined();
    expect(adminStateServer({ kind: 'unauthenticated', server })).toBe(server);
  });

  it('should reflow across normal compact and resize-only geometry', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: {
        ...authenticatedState(),
        organization: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Selected Organization',
          slug: 'selected-organization',
          status: 'active',
        },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        expect(frameText(application)).toContain('Porta Administration');

        application.loop.resize({ width: 48, height: 12 });
        expect(frameText(application)).toContain('Porta Admin');
        expect(frameText(application)).toContain('Reauthenticate');

        application.loop.resize({ width: 24, height: 6 });
        expect(frameText(application)).toContain('Terminal too small');
        expect(frameText(application)).not.toContain('admin@example.test');
        expect(frameText(application)).not.toContain('Session');
        return 0;
      },
    });
  });

  it('should route keyboard shortcuts and preserve authenticated state when reauthentication is cancelled', async () => {
    let operationSignal: AbortSignal | undefined;
    const reauthenticate = vi.fn(
      (signal: AbortSignal) =>
        new Promise<AdminConnectionState>(() => {
          operationSignal = signal;
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
        application.loop.dispatch({
          type: 'key',
          key: 'r',
          ctrl: true,
          alt: false,
          shift: false,
          codepoint: 114,
        });
        await settle();
        expect(reauthenticate).toHaveBeenCalledOnce();
        expect(application.loop.isCommandEnabled('cancel')).toBe(true);

        application.loop.dispatch({
          type: 'key',
          key: 'escape',
          ctrl: false,
          alt: false,
          shift: false,
        });
        await settle();
        expect(operationSignal?.aborted).toBe(true);
        expect(frameText(application)).not.toContain('admin@example.test');
        expect(frameText(application)).toContain('Authenticated');
        return 0;
      },
    });
  });

  it('should preserve authenticated state after dialog-level reauthentication cancellation', async () => {
    const reauthenticate = vi.fn().mockResolvedValue(undefined);

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(),
      session: { reauthenticate },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand('reauthenticate');
        await settle();

        expect(reauthenticate).toHaveBeenCalledOnce();
        expect(frameText(application)).not.toContain('admin@example.test');
        expect(frameText(application)).toContain('Authenticated');
        return 0;
      },
    });
  });

  it('should open a JSVision server-selection dialog when no source is configured', async () => {
    await runAdminApplication({
      insecure: false,
      viewport: { width: 80, height: 24 },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        expect(frameText(application)).toContain('Select Porta Server');
        application.loop.endModal('cancel');
        await settle();
        return 0;
      },
    });
  });

  it('should route only commands enabled for the current state', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      kind: 'authenticated',
      server,
      identity: { sub: 'subject-1', email: 'admin@example.test' },
      capabilities: { canReadOrganizations: true, canCreateOrganizations: true },
    } satisfies AdminConnectionState);

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      session: { authenticate },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        expect(application.loop.isCommandEnabled('authenticate')).toBe(true);
        expect(application.loop.isCommandEnabled('reauthenticate')).toBe(false);
        expect(application.loop.isCommandEnabled('who-am-i')).toBe(false);
        expect(application.loop.isCommandEnabled('create-organization')).toBe(false);
        expect(application.loop.isCommandEnabled('switch-organization')).toBe(false);

        application.loop.emitCommand('authenticate');
        await settle();

        expect(application.loop.isCommandEnabled('authenticate')).toBe(false);
        expect(application.loop.isCommandEnabled('reauthenticate')).toBe(true);
        expect(application.loop.isCommandEnabled('who-am-i')).toBe(true);
        expect(application.loop.isCommandEnabled('create-organization')).toBe(true);
        expect(application.loop.isCommandEnabled('switch-organization')).toBe(true);
        return 0;
      },
    });
  });

  it('should remove temporary signal handlers and finalize exactly once', async () => {
    const listeners = new Map<NodeJS.Signals, () => void>();
    const signalSource: AdminSignalSource = {
      once: vi.fn((signal, listener) => listeners.set(signal, listener)),
      off: vi.fn((signal, listener) => {
        if (listeners.get(signal) === listener) listeners.delete(signal);
      }),
    };
    const finalizer = vi.fn();

    const exitCode = await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      applicationFactory: createApplication,
      applicationFinalizer: finalizer,
      signalSource,
      platform: 'linux',
      applicationRunner: async () => {
        listeners.get('SIGTERM')?.();
        return 0;
      },
    });

    expect(exitCode).toBe(143);
    expect(signalSource.once).toHaveBeenCalledTimes(3);
    expect(signalSource.off).toHaveBeenCalledTimes(3);
    expect(listeners.size).toBe(0);
    expect(finalizer).toHaveBeenCalledOnce();
  });

  it('should unregister organization commands and quarantine a pending list during disposal', async () => {
    let finishList: ((result: unknown) => void) | undefined;
    const listAll = vi.fn(
      () =>
        new Promise((resolve) => {
          finishList = resolve;
        }),
    );
    let disposedApplication: ReturnType<typeof createApplication> | undefined;

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: {
        ...authenticatedState(),
        capabilities: { canReadOrganizations: true, canCreateOrganizations: false },
      },
      session: { organizations: { listAll, create: vi.fn(), reconcile: vi.fn() } },
      applicationFactory: createApplication,
      applicationFinalizer: (application) => application.loop.dispose(),
      applicationRunner: async (application) => {
        disposedApplication = application;
        application.loop.emitCommand('switch-organization');
        await settle();
        expect(listAll).toHaveBeenCalledOnce();
        return 0;
      },
    });

    finishList?.({
      kind: 'success',
      value: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Late Organization',
          slug: 'late-organization',
          status: 'active',
        },
      ],
    });
    disposedApplication?.loop.emitCommand('switch-organization');
    await settle();

    expect(listAll).toHaveBeenCalledOnce();
    expect(disposedApplication && frameText(disposedApplication)).not.toContain(
      'Late Organization',
    );
  });

  it('should strip terminal controls and bound verified display values', async () => {
    const hostileName = `Admin\u001b[2J${'x'.repeat(200)}`;

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: {
        kind: 'authenticated',
        server,
        identity: { sub: 'subject-1', email: 'admin@example.test', name: hostileName },
        capabilities: noOrganizationCapabilities,
      },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const frame = frameText(application);
        expect(frame).not.toContain('\u001b');
        expect(frame).not.toContain('[2J');
        expect(frame.length).toBeLessThanOrEqual(80 * 24 + 23);
        expect(frame.replace(/[^\x20-\x7e\n]/g, '')).toContain('Alt-X Quit');
        return 0;
      },
    });
  });
});
