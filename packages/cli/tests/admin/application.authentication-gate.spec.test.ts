/** Observable specifications for the blocking unauthenticated administration gate. */

import { Button, createApplication, Dialog, Group, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { runAdminApplication } from '../../src/admin/application.js';
import type { AdminConnectionState } from '../../src/admin/state.js';

const server = new URL('https://porta.example.test');
const identity = { sub: 'subject-1', email: 'admin@example.test' };

/** Reads visible characters from the real JSVision frame buffer. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Allows modal and operation promise continuations to repaint. */
async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

/** Sends one decoded keyboard event through the real JSVision loop. */
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

/** Finds the dialog containing the currently focused gate control. */
function focusedDialog(application: ReturnType<typeof createApplication>): Dialog {
  let current: View | null = application.loop.getFocused();
  while (current && !(current instanceof Dialog)) current = current.parent;
  if (!(current instanceof Dialog)) throw new Error('Authentication gate was not focused.');
  return current;
}

/** Collects every button in one dialog without depending on its layout coordinates. */
function dialogButtons(dialog: Dialog): Button[] {
  const result: Button[] = [];
  const visit = (view: View): void => {
    if (view instanceof Button) result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(dialog);
  return result;
}

/** Clicks an absolute terminal cell using the terminal's one-based mouse coordinates. */
function click(
  application: ReturnType<typeof createApplication>,
  absoluteX: number,
  absoluteY: number,
): void {
  for (const kind of ['down', 'up'] as const) {
    application.loop.dispatch({
      type: 'mouse',
      kind,
      button: 0,
      x: absoluteX + 1,
      y: absoluteY + 1,
    });
  }
}

/** Returns a verified state that still needs an organization choice. */
function authenticatedState(): AdminConnectionState {
  return {
    kind: 'authenticated',
    server,
    identity,
    capabilities: { canReadOrganizations: false, canCreateOrganizations: false },
  };
}

describe('unauthenticated authentication gate', () => {
  it('should open automatically with Authenticate focused and only Authenticate and Quit choices', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        await settle();
        const dialog = focusedDialog(application);
        const focused = application.loop.getFocused();

        expect(frameText(application)).toContain('Authentication required');
        expect(focused).toBeInstanceOf(Button);
        expect((focused as Button).activation.label).toBe('Authenticate');
        expect(dialogButtons(dialog).map((button) => button.activation.label)).toEqual([
          'Authenticate',
          'Quit',
        ]);
        expect(frameText(application)).not.toContain('Retry');

        press(application, 'escape');
        expect(focusedDialog(application)).toBe(dialog);

        const origin = application.loop.renderRoot.originOf(dialog);
        if (!origin) throw new Error('Authentication gate has no rendered origin.');
        click(application, origin.x + 3, origin.y);
        expect(focusedDialog(application)).toBe(dialog);
        return 0;
      },
    });
  });

  it.each(['enter', 'mouse'] as const)(
    'should start the existing authentication operation by %s activation',
    async (activation) => {
      const authenticate = vi.fn().mockResolvedValue(authenticatedState());

      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        initialState: { kind: 'unauthenticated', server },
        session: {
          authenticate,
          organizations: { listAll: vi.fn(), create: vi.fn(), reconcile: vi.fn() },
        },
        applicationFactory: createApplication,
        applicationRunner: async (application) => {
          await settle();
          if (activation === 'enter') {
            press(application, 'enter');
          } else {
            const focused = application.loop.getFocused();
            if (!(focused instanceof Button)) throw new Error('Authenticate was not focused.');
            const origin = application.loop.renderRoot.originOf(focused);
            if (!origin) throw new Error('Authenticate has no rendered origin.');
            click(application, origin.x + 2, origin.y);
          }
          await settle();

          expect(authenticate).toHaveBeenCalledOnce();
          expect(authenticate.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
          expect(frameText(application)).toContain('Organizations');
          application.loop.emitCommand('quit');
          return 0;
        },
      });
    },
  );

  it('should make Quit the only alternative to authentication', async () => {
    const quit = vi.fn();

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const unregister = application.onCommand('quit', quit);
        await settle();
        press(application, 'tab');
        expect(application.loop.getFocused()).toBeInstanceOf(Button);
        expect((application.loop.getFocused() as Button).activation.label).toBe('Quit');
        press(application, 'enter');
        await settle();
        expect(quit).toHaveBeenCalledOnce();
        unregister();
        return 0;
      },
    });
  });

  it('should reopen after cancellation and sanitized failure', async () => {
    const hostileDetail = 'Bearer secret-token\n/home/operator/credentials\nremote stack';
    const authenticate = vi
      .fn()
      .mockImplementationOnce(
        (signal: AbortSignal) =>
          new Promise<AdminConnectionState | undefined>((resolve) => {
            signal.addEventListener('abort', () => resolve(undefined), { once: true });
          }),
      )
      .mockRejectedValueOnce(new Error(hostileDetail));

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      session: { authenticate },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        await settle();
        press(application, 'enter');
        await settle();
        press(application, 'escape');
        await settle();
        expect(frameText(application)).toContain('Authentication required');

        press(application, 'enter');
        await settle();
        const failureFrame = frameText(application);
        expect(failureFrame).toContain('Authentication required');
        expect(failureFrame).not.toContain('secret-token');
        expect(failureFrame).not.toContain('/home/operator');
        expect(failureFrame).not.toContain('remote stack');
        return 0;
      },
    });
  });

  it('should restore the gate after a session invalidation or recoverable resize', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        await settle();
        application.loop.resize({ width: 24, height: 6 });
        expect(frameText(application)).toContain('Terminal too small');
        expect(frameText(application)).not.toContain('Authentication required');

        application.loop.resize({ width: 80, height: 24 });
        await settle();
        expect(frameText(application)).toContain('Authentication required');
        return 0;
      },
    });

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: {
        ...authenticatedState(),
        capabilities: { canReadOrganizations: true, canCreateOrganizations: false },
      },
      session: {
        organizations: {
          listAll: vi.fn().mockResolvedValue({ kind: 'session-invalid' }),
          create: vi.fn(),
          reconcile: vi.fn(),
        },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand('switch-organization');
        await settle();
        expect(frameText(application)).toContain('Authentication required');
        expect(application.loop.getFocused()).toBeInstanceOf(Button);
        return 0;
      },
    });
  });
});
