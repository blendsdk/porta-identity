/** Implementation diagnostics for compact OIDC client registration and secret presentation. */

import { Button, createApplication, Dialog, Group, Input, View } from '@jsvision/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { showClientRegistrationDialog as showDirectRegistration } from '../../src/admin/client-registration-dialog.js';
import {
  showClientRegistrationDialog as showFacadeRegistration,
  showOneTimeClientSecretDialog,
} from '../../src/admin/client-dialogs.js';
import type { AdminOrganizationContext } from '../../src/admin/state.js';

const organization: AdminOrganizationContext = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example',
  status: 'active',
};

const application = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

/** Allows modal mounting and reactive children to settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Collects every mounted descendant in paint order. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Returns the active modal or fails with a clear diagnostic. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected an active client dialog.');
  return dialog;
}

/** Reads the complete visible terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Activates a button through its normal keyboard path. */
function activate(host: ReturnType<typeof createApplication>, button: Button): void {
  host.loop.focusView(button);
  host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('compact OIDC registration implementation', () => {
  it('keeps the stable facade bound to the direct registration implementation', () => {
    expect(showFacadeRegistration).toBe(showDirectRegistration);
  });

  it('focuses the first field and emits only Client details payload values', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = showDirectRegistration(host, new AbortController().signal, {
      organization,
      applications: [application],
    });
    await settle();
    const dialog = activeDialog(host);
    const inputs = descendants(dialog).filter((view) => view instanceof Input);
    const name = inputs.filter((input) => input.getMaxLength() === 255)[0];
    const redirect = inputs.find((input) => input.getMaxLength() === 2_048);
    const create = descendants(dialog)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.command === 'ok');
    if (!name || !redirect || !create) {
      throw new Error('Compact registration controls are incomplete.');
    }

    expect(host.loop.getFocused()).toBe(name);
    name.getValueSignal().set('Operations portal');
    redirect.getValueSignal().set('https://operations.example.test/callback');
    activate(host, create);

    await expect(pending).resolves.toEqual({
      kind: 'create',
      input: {
        applicationId: application.id,
        clientName: 'Operations portal',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['https://operations.example.test/callback'],
      },
    });
  });

  it('removes an aborted registration dialog without returning partial input', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const controller = new AbortController();
    const pending = showDirectRegistration(host, controller.signal, {
      organization,
      applications: [application],
    });
    await settle();
    const input = descendants(activeDialog(host)).find((view) => view instanceof Input);
    input?.getValueSignal().set('Partial client');

    controller.abort();

    await expect(pending).resolves.toEqual({ kind: 'cancel' });
    expect(host.desktop.activeWindow()).toBeNull();
    expect(frameText(host)).not.toContain('Partial client');
  });

  it('removes one-time plaintext from the render tree immediately after abort', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const controller = new AbortController();
    const plaintext = 'one-time-secret-must-disappear';
    const pending = showOneTimeClientSecretDialog(host, controller.signal, {
      clientName: 'Operations portal',
      clientId: 'porta-operations-client',
      label: 'initial',
      plaintext,
      expiresAt: '2027-03-08T00:00:00.000Z',
    });
    await settle();
    expect(frameText(host)).toContain(plaintext);

    controller.abort();
    await pending;

    expect(host.desktop.activeWindow()).toBeNull();
    expect(frameText(host)).not.toContain(plaintext);
  });
});
