/**
 * Immutable behavior contract for role pre-assignment in the terminal invitation dialog.
 *
 * These cases derive from GitHub #182: role selection is available only with the role-assign,
 * application-read and role-read capabilities; the exact selected pairs reach the invite payload;
 * the email preview remains independent; and a failed catalog read never blocks an otherwise valid
 * invitation.
 */

import {
  Button,
  CheckGroup,
  createApplication,
  Dialog,
  Group,
  Input,
  View,
} from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import type { AdminApplication } from '../../src/admin/application-state.js';
import type { AdminRbacReadResult, AdminRole } from '../../src/admin/rbac-state.js';
import type { AdminApplicationReadResult } from '../../src/admin/application-state.js';
import { showInviteUserDialog } from '../../src/admin/user-dialogs.js';

const applicationId = '33333333-3333-4333-8333-333333333333';
const secondApplicationId = '55555555-5555-4555-8555-555555555555';
const roleId = '44444444-4444-4444-8444-444444444444';
const secondRoleId = '66666666-6666-4666-8666-666666666666';
const thirdRoleId = '77777777-7777-4777-8777-777777777777';

/** Minimal catalog seam accepted by the invite dialog. */
interface RoleSource {
  listApplications(): Promise<AdminApplicationReadResult<readonly AdminApplication[]>>;
  listRoles(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<AdminRbacReadResult<readonly AdminRole[]>>;
}

const application: AdminApplication = {
  id: applicationId,
  name: 'Customer Portal',
  slug: 'customer-portal',
  description: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const secondApplication: AdminApplication = {
  ...application,
  id: secondApplicationId,
  name: 'Operations Portal',
  slug: 'operations-portal',
};
const billingRole: AdminRole = {
  id: roleId,
  applicationId,
  name: 'Billing administrator',
  slug: 'billing-admin',
  description: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const supportRole: AdminRole = {
  ...billingRole,
  id: secondRoleId,
  name: 'Support agent',
  slug: 'support-agent',
};
const operatorRole: AdminRole = {
  ...billingRole,
  id: thirdRoleId,
  applicationId: secondApplicationId,
  name: 'Operator',
  slug: 'operator',
};

/** Builds one distinct role for a large-catalog case. */
function roleAt(index: number): AdminRole {
  return {
    ...billingRole,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `Role ${index}`,
    slug: `role-${index}`,
  };
}

/** Returns a live catalog with one role set per application. */
function roleSource(): RoleSource {
  return {
    async listApplications() {
      return { kind: 'success', value: [application, secondApplication] };
    },
    async listRoles(id) {
      if (id === applicationId) return { kind: 'success', value: [billingRole, supportRole] };
      if (id === secondApplicationId) return { kind: 'success', value: [operatorRole] };
      return { kind: 'failure', failure: 'not-found' };
    },
  };
}

/** Allows modal mounting, promise continuations and reactive redraw to settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

/** Collects every descendant from one real JSVision view. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Returns the active dialog and its visible controls. */
function activeForm(applicationRoot: ReturnType<typeof createApplication>): {
  readonly dialog: Dialog;
  readonly inputs: Input[];
  readonly buttons: Button[];
  readonly checks: CheckGroup[];
} {
  const dialog = applicationRoot.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a mounted dialog.');
  const views = descendants(dialog);
  return {
    dialog,
    inputs: views.filter((view) => view instanceof Input),
    buttons: views.filter((view) => view instanceof Button),
    checks: views.filter((view) => view instanceof CheckGroup),
  };
}

/** Returns one button by its visible label. */
function button(root: ReturnType<typeof createApplication>, label: string): Button {
  const found = activeForm(root).buttons.find((item) => item.activation.label === label);
  if (!found) throw new Error(`Button ${label} is missing.`);
  return found;
}

/** Reads all visible text from the real terminal frame. */
function frameText(root: ReturnType<typeof createApplication>): string {
  return root.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Clicks one button through the real focus and key path. */
function click(root: ReturnType<typeof createApplication>, target: Button): void {
  root.loop.focusView(target);
  root.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
}

describe('terminal invitation role pre-assignment', () => {
  it('should hide role selection when no catalog source is available', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showInviteUserDialog(root, new AbortController().signal, async () => ({
      kind: 'failure',
      failure: 'unavailable',
    }));
    await settle();

    expect(frameText(root)).not.toContain('Roles');
    expect(activeForm(root).buttons.some((item) => item.activation.label === 'Select…')).toBe(
      false,
    );

    root.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should select roles and forward the exact pairs with the invitation', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      async () => ({ kind: 'failure', failure: 'unavailable' }),
      roleSource(),
    );
    await settle();

    expect(frameText(root)).toContain('Roles');
    click(root, button(root, 'Select…'));
    await settle();

    const checks = activeForm(root).checks;
    expect(checks).toHaveLength(1);
    root.loop.focusView(checks[0]!);
    root.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    root.loop.dispatch({ type: 'key', key: 'down', ctrl: false, alt: false, shift: false });
    root.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();
    click(root, button(root, 'Done'));
    await settle();

    const inviteForm = activeForm(root);
    inviteForm.inputs[0]?.getValueSignal().set('alice@example.test');
    click(root, button(root, 'Invite'));

    await expect(operation).resolves.toEqual({
      kind: 'invite',
      input: {
        email: 'alice@example.test',
        roles: [
          { applicationId, roleId },
          { applicationId, roleId: secondRoleId },
        ],
      },
    });
  });

  it('should keep the email preview independent while forwarding roles to the invitation', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const preview = vi.fn(async () => ({
      kind: 'success' as const,
      value: { subject: 'Welcome', text: 'Plain invitation' },
    }));
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      preview,
      roleSource(),
    );
    await settle();

    click(root, button(root, 'Select…'));
    await settle();
    const checks = activeForm(root).checks[0];
    if (!checks) throw new Error('Role checklist is missing.');
    root.loop.focusView(checks);
    root.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();
    click(root, button(root, 'Done'));
    await settle();

    activeForm(root).inputs[0]?.getValueSignal().set('alice@example.test');
    const inviteDialog = activeForm(root).dialog;
    click(root, button(root, 'Preview'));
    for (let index = 0; index < 20 && root.desktop.activeWindow() === inviteDialog; index += 1) {
      await settle();
    }
    expect(root.desktop.activeWindow()).not.toBe(inviteDialog);
    expect(preview).toHaveBeenCalledWith({ email: 'alice@example.test' });
    root.loop.endModal('ok');
    await settle();

    click(root, button(root, 'Invite'));
    await expect(operation).resolves.toMatchObject({
      kind: 'invite',
      input: { roles: [{ applicationId, roleId }] },
    });
  });

  it('should keep the invitation usable without roles when the catalog read fails', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const failed: RoleSource = {
      async listApplications() {
        return { kind: 'failure', failure: 'unavailable' };
      },
      async listRoles() {
        return { kind: 'failure', failure: 'unavailable' };
      },
    };
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      async () => ({ kind: 'failure', failure: 'unavailable' }),
      failed,
    );
    await settle();

    click(root, button(root, 'Select…'));
    await settle();
    expect(frameText(root)).toContain('Role options unavailable');
    click(root, button(root, 'Done'));
    await settle();

    activeForm(root).inputs[0]?.getValueSignal().set('alice@example.test');
    click(root, button(root, 'Invite'));
    const result = await operation;
    expect(result).toMatchObject({ kind: 'invite', input: { email: 'alice@example.test' } });
    expect(result.kind === 'invite' ? result.input : {}).not.toHaveProperty('roles');
  });

  it('should preserve a previous selection when the role checklist is cancelled', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      async () => ({ kind: 'failure', failure: 'unavailable' }),
      roleSource(),
    );
    await settle();

    click(root, button(root, 'Select…'));
    await settle();
    const first = activeForm(root).checks[0];
    if (!first) throw new Error('Role checklist is missing.');
    root.loop.focusView(first);
    root.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();
    click(root, button(root, 'Done'));
    await settle();
    click(root, button(root, 'Select…'));
    await settle();
    root.loop.focusView(activeForm(root).checks[0]!);
    root.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();
    click(root, button(root, 'Cancel'));
    await settle();

    activeForm(root).inputs[0]?.getValueSignal().set('alice@example.test');
    click(root, button(root, 'Invite'));
    await expect(operation).resolves.toMatchObject({
      kind: 'invite',
      input: { roles: [{ applicationId, roleId }] },
    });
  });

  it('should focus the checklist after the catalog loads', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      async () => ({ kind: 'failure', failure: 'unavailable' }),
      roleSource(),
    );
    await settle();
    click(root, button(root, 'Select…'));
    await settle();

    expect(root.loop.getFocused()).toBeInstanceOf(CheckGroup);

    root.loop.endModal('cancel');
    await settle();
    root.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should focus Reload after a catalog failure', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const source: RoleSource = {
      async listApplications() {
        return { kind: 'failure', failure: 'unavailable' };
      },
      async listRoles() {
        return { kind: 'failure', failure: 'unavailable' };
      },
    };
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      async () => ({ kind: 'failure', failure: 'unavailable' }),
      source,
    );
    await settle();
    click(root, button(root, 'Select…'));
    await settle();

    const focused = root.loop.getFocused();
    expect(focused).toBeInstanceOf(Button);
    expect((focused as Button).activation.label).toBe('Reload');

    root.loop.endModal('cancel');
    await settle();
    root.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should reveal a role beyond the first viewport in a large catalog', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const roles = Array.from({ length: 25 }, (_unused, index) => roleAt(index + 1));
    const source: RoleSource = {
      async listApplications() {
        return { kind: 'success', value: [application] };
      },
      async listRoles() {
        return { kind: 'success', value: roles };
      },
    };
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      async () => ({ kind: 'failure', failure: 'unavailable' }),
      source,
    );
    await settle();
    click(root, button(root, 'Select…'));
    await settle();

    const checklist = activeForm(root).checks[0];
    if (!checklist) throw new Error('Role checklist is missing.');
    root.loop.focusView(checklist);
    for (let index = 0; index < 24; index += 1) {
      root.loop.dispatch({ type: 'key', key: 'down', ctrl: false, alt: false, shift: false });
    }
    await settle();
    expect(frameText(root)).toContain('Role 25');

    root.loop.endModal('cancel');
    await settle();
    root.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should omit the reserved invitation machine role from the checklist', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const source: RoleSource = {
      async listApplications() {
        return { kind: 'success', value: [{ ...application, slug: 'porta-admin' }] };
      },
      async listRoles() {
        return {
          kind: 'success',
          value: [{ ...billingRole, slug: 'porta-invite-service' }],
        };
      },
    };
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      async () => ({ kind: 'failure', failure: 'unavailable' }),
      source,
    );
    await settle();
    click(root, button(root, 'Select…'));
    await settle();

    expect(frameText(root)).toContain('No roles available');
    expect(frameText(root)).not.toContain('invite-service');

    root.loop.endModal('cancel');
    await settle();
    root.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should neutralize bidi formatting and accelerator markers in role labels', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    const source: RoleSource = {
      async listApplications() {
        return { kind: 'success', value: [application] };
      },
      async listRoles() {
        return {
          kind: 'success',
          value: [{ ...billingRole, name: 'Evil\u202e~A~', slug: 'evil-role' }],
        };
      },
    };
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      async () => ({ kind: 'failure', failure: 'unavailable' }),
      source,
    );
    await settle();
    click(root, button(root, 'Select…'));
    await settle();

    const text = frameText(root);
    expect(text).not.toContain('\u202e');
    expect(text).toContain('\ufffd');
    expect(text).not.toContain('~A~');

    root.loop.endModal('cancel');
    await settle();
    root.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });

  it('should disable role selection while a preview request is in flight', async () => {
    const root = createApplication({ viewport: { width: 80, height: 24 } });
    let resolvePreview: ((value: { kind: 'failure'; failure: 'unavailable' }) => void) | undefined;
    const preview = vi.fn(
      () =>
        new Promise<{ kind: 'failure'; failure: 'unavailable' }>((resolve) => {
          resolvePreview = resolve;
        }),
    );
    const operation = showInviteUserDialog(
      root,
      new AbortController().signal,
      preview,
      roleSource(),
    );
    await settle();
    activeForm(root).inputs[0]?.getValueSignal().set('alice@example.test');
    click(root, button(root, 'Preview'));
    await settle();

    expect(button(root, 'Select…').state.disabled).toBe(true);

    resolvePreview?.({ kind: 'failure', failure: 'unavailable' });
    await settle();
    expect(button(root, 'Select…').state.disabled).toBe(false);

    root.loop.endModal('cancel');
    await expect(operation).resolves.toEqual({ kind: 'cancel' });
  });
});
