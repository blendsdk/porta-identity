/** Implementation diagnostics for the organization dialog view trees. */

import { Button, createApplication, Dialog, Group, Input, ListView, View } from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import {
  showCreateOrganizationDialog,
  showOrganizationChooser,
  showWhoAmIDialog,
} from '../../src/admin/organization-dialogs.js';

const server = new URL('https://porta.example.test');
const capabilities = { canReadOrganizations: true, canCreateOrganizations: true };

/** Allows modal mounting and reactive updates to settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Collects all descendants of one retained JSVision view tree. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) {
      for (const child of view.children) visit(child);
    }
  };
  visit(root);
  return result;
}

describe('organization dialog implementation', () => {
  it('should cap the identity dialog and focus its terminating button', async () => {
    const application = createApplication({ viewport: { width: 48, height: 12 } });
    const result = showWhoAmIDialog(
      application,
      {
        kind: 'authenticated',
        server,
        identity: { sub: 'subject-1', email: 'admin@example.test' },
        capabilities,
      },
      false,
    );
    await settle();

    const dialog = application.desktop.activeWindow();
    expect(dialog).toBeInstanceOf(Dialog);
    expect(dialog?.bounds.width).toBeLessThanOrEqual(48);
    expect(dialog?.bounds.height).toBeLessThanOrEqual(12);
    expect(application.loop.getFocused()).toBeInstanceOf(Button);

    application.loop.endModal('cancel');
    await result;
    expect(application.desktop.activeWindow()).toBeNull();
  });

  it('should start the chooser focused but without an implicit selection', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showOrganizationChooser(application, {
      capabilities,
      organizations: Promise.resolve({
        kind: 'success',
        value: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'First Organization',
            slug: 'first-organization',
            status: 'active',
          },
        ],
      }),
    });
    await settle();

    const dialog = application.desktop.activeWindow();
    expect(dialog).toBeInstanceOf(Dialog);
    const list = dialog && descendants(dialog).find((view) => view instanceof ListView);
    expect(list).toBeInstanceOf(ListView);
    if (!(list instanceof ListView)) throw new Error('Organization list was not mounted.');
    expect(list.focused.peek()).toBe(0);
    expect(list.selected.peek()).toBe(-1);
    expect(application.loop.getFocused()).toBe(list.rows);

    application.loop.endModal('cancel');
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });

  it('should mount bounded inputs and standard terminating commands in the create form', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showCreateOrganizationDialog(application);
    await settle();

    const dialog = application.desktop.activeWindow();
    expect(dialog).toBeInstanceOf(Dialog);
    if (!(dialog instanceof Dialog)) throw new Error('Create dialog was not mounted.');
    const views = descendants(dialog);
    const inputs = views.filter((view) => view instanceof Input);
    const commands = views
      .filter((view) => view instanceof Button)
      .map((button) => button.activation.command);

    expect(inputs.map((input) => input.getMaxLength())).toEqual([255, 100, 10]);
    expect(application.loop.getFocused()).toBe(inputs[0]);
    expect(commands).toEqual(['ok', 'cancel']);

    application.loop.endModal('cancel');
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });
});
