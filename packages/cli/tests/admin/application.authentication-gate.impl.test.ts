/** Focused lifecycle diagnostics for the application-owned authentication gate. */

import { createApplication } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { runAdminApplication } from '../../src/admin/application.js';
import type { AdminConnectionState } from '../../src/admin/state.js';

const server = new URL('https://porta.example.test');

/** Allows modal and operation continuations to complete. */
async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

/** Sends one decoded key through the real application loop. */
function press(application: ReturnType<typeof createApplication>, key: string): void {
  application.loop.dispatch({
    type: 'key',
    key,
    ctrl: false,
    alt: false,
    shift: false,
    ...(key.length === 1 ? { codepoint: key.codePointAt(0) } : {}),
  });
}

/** Reads visible characters from the real frame buffer. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

describe('authentication gate lifecycle', () => {
  it('should own one modal across cancellation, late completion, and resize recovery', async () => {
    let finishAuthentication: ((state: AdminConnectionState) => void) | undefined;
    let operationSignal: AbortSignal | undefined;
    const authenticate = vi.fn(
      (signal: AbortSignal) =>
        new Promise<AdminConnectionState>((resolve) => {
          operationSignal = signal;
          finishAuthentication = resolve;
        }),
    );

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      session: { authenticate },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const executeModal = vi.spyOn(application.loop, 'execView');
        await settle();
        expect(executeModal).toHaveBeenCalledTimes(1);

        press(application, 'enter');
        await settle();
        expect(authenticate).toHaveBeenCalledOnce();

        press(application, 'escape');
        await settle();
        expect(operationSignal?.aborted).toBe(true);
        expect(executeModal).toHaveBeenCalledTimes(2);

        finishAuthentication?.({
          kind: 'authenticated',
          server,
          identity: { sub: 'late-subject', email: 'late@example.test' },
          capabilities: { canReadOrganizations: false, canCreateOrganizations: false },
        });
        await settle();
        expect(frameText(application)).toContain('Authentication required');
        expect(frameText(application)).not.toContain('late@example.test');
        expect(executeModal).toHaveBeenCalledTimes(2);

        application.loop.resize({ width: 24, height: 6 });
        expect(frameText(application)).toContain('Terminal too small');
        application.loop.resize({ width: 80, height: 24 });
        await settle();
        expect(executeModal).toHaveBeenCalledTimes(3);
        application.loop.resize({ width: 80, height: 24 });
        await settle();
        expect(executeModal).toHaveBeenCalledTimes(3);
        return 0;
      },
    });
  });

  it('should dispose an open gate without reopening it', async () => {
    const finalizer = vi.fn((application: ReturnType<typeof createApplication>) => {
      application.loop.dispose();
    });
    let executeModal: ReturnType<typeof vi.spyOn> | undefined;

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      applicationFactory: createApplication,
      applicationFinalizer: finalizer,
      applicationRunner: async (application) => {
        executeModal = vi.spyOn(application.loop, 'execView');
        await settle();
        expect(executeModal).toHaveBeenCalledOnce();
        return 0;
      },
    });

    await settle();
    expect(finalizer).toHaveBeenCalledOnce();
    expect(executeModal).toHaveBeenCalledOnce();
  });
});
