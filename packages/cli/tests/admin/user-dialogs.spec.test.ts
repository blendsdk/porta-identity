/** Observable specifications for focused user administration dialogs. */

import { defaultTheme } from '@jsvision/core';
import { Button, CheckGroup, createApplication, Dialog, Group, Input, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { createAdminDialogSurface } from '../../src/admin/application-runtime.js';
import { createAdminPresentation } from '../../src/admin/presentation.js';
import type { AdminUserDetail } from '../../src/admin/user-state.js';
import {
  showCreateUserDialog,
  showEditUserDialog,
  showInviteUserDialog,
  showPurgeUserDialog,
  showSetUserPasswordDialog,
  showUserConfirmationDialog,
  showUserReasonDialog,
} from '../../src/admin/user-dialogs.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const detail: AdminUserDetail = {
  id: '22222222-2222-4222-8222-222222222222',
  organizationId,
  email: 'alice@example.test',
  givenName: 'Alice',
  familyName: 'Admin',
  status: 'active',
  emailVerified: false,
  hasPassword: true,
  middleName: null,
  nickname: null,
  preferredUsername: null,
  profileUrl: null,
  pictureUrl: null,
  websiteUrl: null,
  gender: null,
  birthdate: null,
  zoneinfo: null,
  locale: 'en',
  phoneNumber: null,
  phoneNumberVerified: false,
  addressStreet: null,
  addressLocality: null,
  addressRegion: null,
  addressPostalCode: null,
  addressCountry: null,
  twoFactorEnabled: false,
  lastLoginAt: null,
  loginCount: 0,
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-08-29T10:00:00Z',
};

/** Allows modal mounting and reactive redraw to settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Collects every descendant from one real JSVision dialog. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Returns the active dialog and its inputs. */
function activeForm(application: ReturnType<typeof createApplication>): {
  readonly dialog: Dialog;
  readonly inputs: Input[];
  readonly buttons: Button[];
} {
  const dialog = application.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a mounted dialog.');
  const views = descendants(dialog);
  return {
    dialog,
    inputs: views.filter((view) => view instanceof Input),
    buttons: views.filter((view) => view instanceof Button),
  };
}

/** Reads all visible text from the real terminal frame. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

describe('user dialogs', () => {
  it('should repaint the desktop and restore a focusable leaf after create is cancelled', async () => {
    const server = new URL('https://porta.example.test');
    const presentation = createAdminPresentation(
      {
        kind: 'authenticated',
        server,
        identity: { sub: 'subject-1', email: 'admin@example.test' },
        capabilities: {
          canReadOrganizations: true,
          canCreateOrganizations: true,
          canReadUsers: true,
          canCreateUsers: true,
          canInviteUsers: true,
          canUpdateUsers: true,
          canManageUserLifecycle: true,
          canPurgeUsers: true,
        },
      },
      false,
      { width: 80, height: 24 },
    );
    const application = createApplication({
      content: presentation.content,
      menuBar: presentation.menu,
      statusLine: presentation.status,
      viewport: { width: 80, height: 24 },
    });
    application.loop.focusInto(presentation.content);
    const surface = createAdminDialogSurface(application, presentation);
    const focusWarnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const operation = showCreateUserDialog(surface.host, new AbortController().signal);
      await settle();
      expect(frameText(application)).toContain('Create user');

      application.loop.endModal('cancel');
      await expect(operation).resolves.toEqual({ kind: 'cancel' });
      await settle();

      const buffer = application.loop.renderRoot.buffer();
      expect(frameText(application)).not.toContain('Create user');
      expect(buffer.get(20, 10)?.char).toBe(defaultTheme.desktop.pattern);
      expect(buffer.get(20, 10)?.bg).toBe(defaultTheme.desktop.bg);
      expect(application.loop.getFocused()).not.toBeInstanceOf(Group);
      expect(focusWarnings).not.toHaveBeenCalledWith(
        expect.stringContaining('focusView(Group) did nothing'),
      );
    } finally {
      focusWarnings.mockRestore();
    }
  });

  it('should map every editable field to its exact bound and control-free validator', async () => {
    const cases: ReadonlyArray<{
      readonly open: (application: ReturnType<typeof createApplication>) => Promise<unknown>;
      readonly maxima: readonly number[];
    }> = [
      {
        open: (application) => showCreateUserDialog(application, new AbortController().signal),
        maxima: [
          2, 10, 10, 20, 50, 50, 50, 128, 128, 255, 255, 255, 255, 255, 255, 255, 255, 500, 2_048,
          2_048, 2_048,
        ],
      },
      {
        open: (application) =>
          showEditUserDialog(application, new AbortController().signal, detail),
        maxima: [
          2, 10, 10, 20, 50, 50, 50, 255, 255, 255, 255, 255, 255, 255, 500, 2_048, 2_048, 2_048,
        ],
      },
      {
        open: (application) =>
          showInviteUserDialog(application, new AbortController().signal, async () => ({
            kind: 'failure',
            failure: 'unavailable',
          })),
        maxima: [10, 255, 255, 255, 500],
      },
      {
        open: (application) =>
          showSetUserPasswordDialog(application, new AbortController().signal, detail.email),
        maxima: [128, 128],
      },
      {
        open: (application) =>
          showUserReasonDialog(application, new AbortController().signal, 'lock', detail.email),
        maxima: [500],
      },
    ];

    for (const current of cases) {
      const application = createApplication({ viewport: { width: 80, height: 24 } });
      const operation = current.open(application);
      await settle();
      const inputs = activeForm(application).inputs;
      expect(
        inputs.map((input) => input.getMaxLength()).sort((left, right) => left - right),
      ).toEqual(current.maxima);
      for (const input of inputs) {
        const maximum = input.getMaxLength();
        input.getValueSignal().set('x'.repeat(maximum));
        expect(input.valid()).toBe(true);
        input.getValueSignal().set('x'.repeat(maximum + 1));
        expect(input.valid()).toBe(false);
        input.getValueSignal().set('safe\u0085');
        expect(input.valid()).toBe(false);
      }
      application.loop.endModal('cancel');
      await expect(operation).resolves.toEqual({ kind: 'cancel' });
    }
  });

  it('should return bounded create input without phone verification and clear secret signals', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showCreateUserDialog(application, new AbortController().signal);
    await settle();
    const form = activeForm(application);
    const [email, givenName, familyName, password, confirmation] = form.inputs;
    if (!email || !givenName || !familyName || !password || !confirmation)
      throw new Error('Create fields missing.');
    email.getValueSignal().set('alice@example.test');
    givenName.getValueSignal().set('Alice');
    familyName.getValueSignal().set('Admin');
    password.getValueSignal().set('Password-123');
    confirmation.getValueSignal().set('Password-123');
    application.loop.endModal('ok');

    await expect(operation).resolves.toEqual({
      kind: 'create',
      input: {
        email: 'alice@example.test',
        givenName: 'Alice',
        familyName: 'Admin',
        password: 'Password-123',
        passwordConfirmation: 'Password-123',
      },
    });
    expect(password.getValueSignal().peek()).toBe('');
    expect(confirmation.getValueSignal().peek()).toBe('');
  });

  it('should reject create bounds and controls without closing the form', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showCreateUserDialog(application, new AbortController().signal);
    await settle();
    const form = activeForm(application);
    const email = form.inputs[0];
    if (!email) throw new Error('Email field missing.');
    email.getValueSignal().set(`unsafe\u001b@example.test${'x'.repeat(256)}`);
    application.loop.endModal('ok');
    await settle();

    expect(application.desktop.activeWindow()).toBe(form.dialog);
    application.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should preview only bounded plain text and return to the populated invite form', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showInviteUserDialog(application, new AbortController().signal, async () => ({
      kind: 'success',
      value: { subject: 'Welcome Alice', text: 'Plain invitation' },
    }));
    await settle();
    const form = activeForm(application);
    form.inputs[0]?.getValueSignal().set('alice@example.test');
    form.inputs[1]?.getValueSignal().set('Alice');
    const preview = form.buttons.find((button) => button.activation.label === 'Preview');
    if (!preview) throw new Error('Preview action missing.');
    application.loop.focusView(preview);
    application.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();
    expect(
      application.loop.renderRoot
        .buffer()
        .rows()
        .flat()
        .map((cell) => cell.char)
        .join(''),
    ).toContain('Plain invitation');
    application.loop.endModal('ok');
    await settle();
    expect(activeForm(application).inputs[0]?.getValueSignal().peek()).toBe('alice@example.test');
    application.loop.endModal('ok');
    await expect(operation).resolves.toMatchObject({
      kind: 'invite',
      input: { email: 'alice@example.test', givenName: 'Alice' },
    });
    expect((await operation).input).not.toHaveProperty('roles');
    expect((await operation).input).not.toHaveProperty('claims');
  });

  it('should keep populated invite fields after a fixed invalid preview response', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showInviteUserDialog(application, new AbortController().signal, async () => ({
      kind: 'failure',
      failure: 'invalid-response',
    }));
    await settle();
    const form = activeForm(application);
    form.inputs[0]?.getValueSignal().set('alice@example.test');
    form.inputs[1]?.getValueSignal().set('Alice');
    const preview = form.buttons.find((button) => button.activation.label === 'Preview');
    if (!preview) throw new Error('Preview action missing.');
    application.loop.focusView(preview);
    application.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();

    expect(frameText(application)).toContain('Invalid server response');
    expect(form.inputs[0]?.getValueSignal().peek()).toBe('alice@example.test');
    expect(form.inputs[1]?.getValueSignal().peek()).toBe('Alice');
    application.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should return only touched edits, explicit nulls, and never email', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showEditUserDialog(application, new AbortController().signal, detail);
    await settle();
    const form = activeForm(application);
    const text = application.loop.renderRoot
      .buffer()
      .rows()
      .flat()
      .map((cell) => cell.char)
      .join('');
    expect(text).toContain('alice@example.test');
    const [givenName, familyName] = form.inputs;
    givenName?.getValueSignal().set('Alicia');
    familyName?.getValueSignal().set('');
    const check = descendants(form.dialog).find((view) => view instanceof CheckGroup);
    if (!(check instanceof CheckGroup)) throw new Error('Phone verification control missing.');
    application.loop.focusView(check);
    application.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    application.loop.endModal('ok');

    const result = await operation;
    expect(result).toEqual({
      kind: 'update',
      input: { givenName: 'Alicia', familyName: null, phoneNumberVerified: true },
    });
    if (result.kind === 'update') expect(result.input).not.toHaveProperty('email');
  });

  it.each([8, 128])(
    'should accept matching masked password length %i and clear both signals',
    async (length) => {
      const application = createApplication({ viewport: { width: 80, height: 24 } });
      const operation = showSetUserPasswordDialog(
        application,
        new AbortController().signal,
        detail.email,
      );
      await settle();
      const form = activeForm(application);
      const password = 'p'.repeat(length);
      form.inputs[0]?.getValueSignal().set(password);
      form.inputs[1]?.getValueSignal().set(password);
      application.loop.endModal('ok');

      await expect(operation).resolves.toEqual({
        kind: 'set-password',
        input: { password, passwordConfirmation: password },
      });
      expect(form.inputs[0]?.getValueSignal().peek()).toBe('');
      expect(form.inputs[1]?.getValueSignal().peek()).toBe('');
    },
  );

  it.each([
    ['short', 'p'.repeat(7), 'p'.repeat(7)],
    ['long', 'p'.repeat(129), 'p'.repeat(129)],
    ['mismatched', 'Password-123', 'Password-456'],
  ])(
    'should reject %s password input without closing the form',
    async (_case, value, confirmation) => {
      const application = createApplication({ viewport: { width: 80, height: 24 } });
      const operation = showSetUserPasswordDialog(
        application,
        new AbortController().signal,
        detail.email,
      );
      await settle();
      const form = activeForm(application);
      form.inputs[0]?.getValueSignal().set(value);
      form.inputs[1]?.getValueSignal().set(confirmation);
      application.loop.endModal('ok');
      await settle();

      expect(application.desktop.activeWindow()).toBe(form.dialog);
      application.loop.endModal('cancel');
      await expect(operation).resolves.toEqual({ kind: 'cancel' });
    },
  );

  it('should return explicit clear-password and verify-email confirmations', async () => {
    for (const action of ['clear-password', 'verify-email'] as const) {
      const application = createApplication({ viewport: { width: 80, height: 24 } });
      const operation = showUserConfirmationDialog(
        application,
        new AbortController().signal,
        action,
        detail.email,
      );
      await settle();
      application.loop.endModal('ok');
      await expect(operation).resolves.toEqual({ kind: action });
    }
  });

  it('should name the exact user and target state in lifecycle confirmations', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showUserConfirmationDialog(
      application,
      new AbortController().signal,
      'deactivate',
      detail.email,
    );
    await settle();
    expect(frameText(application)).toContain(`Deactivate for ${detail.email}?`);
    expect(frameText(application)).toContain('Target state: inactive');
    application.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should require a bounded control-free lock reason while allowing an empty suspend reason', async () => {
    const lockApp = createApplication({ viewport: { width: 80, height: 24 } });
    const lock = showUserReasonDialog(lockApp, new AbortController().signal, 'lock', detail.email);
    await settle();
    const lockForm = activeForm(lockApp);
    lockForm.inputs[0]?.getValueSignal().set('');
    lockApp.loop.endModal('ok');
    await settle();
    expect(lockApp.desktop.activeWindow()).toBe(lockForm.dialog);
    lockForm.inputs[0]?.getValueSignal().set('Security review');
    lockApp.loop.endModal('ok');
    await expect(lock).resolves.toEqual({ kind: 'lock', reason: 'Security review' });

    const suspendApp = createApplication({ viewport: { width: 80, height: 24 } });
    const suspend = showUserReasonDialog(
      suspendApp,
      new AbortController().signal,
      'suspend',
      detail.email,
    );
    await settle();
    suspendApp.loop.endModal('ok');
    await expect(suspend).resolves.toEqual({ kind: 'suspend' });
  });

  it('should initially focus Cancel and require the distinct permanent purge action', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showPurgeUserDialog(application, new AbortController().signal, detail.email);
    await settle();
    const form = activeForm(application);
    const focused = application.loop.getFocused();
    expect(focused).toBeInstanceOf(Button);
    expect((focused as Button).activation.label).toBe('Cancel');
    expect(form.buttons.map((button) => button.activation.label)).toContain('Purge permanently');
    application.loop.endModal('yes');
    await expect(operation).resolves.toEqual({ kind: 'purge' });

    const cancelApplication = createApplication({ viewport: { width: 80, height: 24 } });
    const cancelled = showPurgeUserDialog(
      cancelApplication,
      new AbortController().signal,
      detail.email,
    );
    await settle();
    cancelApplication.loop.endModal('cancel');
    await expect(cancelled).resolves.toEqual({ kind: 'cancel' });
  });
});
