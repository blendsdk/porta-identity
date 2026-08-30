/** Implementation diagnostics for user-specific modal controls and cleanup. */

import { Button, createApplication, Dialog, Group, Input, View } from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import {
  showCreateUserDialog,
  showInviteUserDialog,
  showPurgeUserDialog,
  showSetUserPasswordDialog,
} from '../../src/admin/user-dialogs.js';
import { textValidator } from '../../src/admin/user-dialog-fields.js';

/** Allows modal mounting and coalesced updates to complete. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Collects all descendants of a mounted dialog. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Returns the active dialog or fails the diagnostic. */
function activeDialog(application: ReturnType<typeof createApplication>): Dialog {
  const dialog = application.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a mounted dialog.');
  return dialog;
}

/** Reads visible frame text from the real renderer. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

describe('user dialog implementation', () => {
  it.each([2, 10, 20, 50, 128, 255, 500, 2_048])(
    'should accept field bound %i and reject overflow and terminal controls',
    (maximum) => {
      const validator = textValidator(0, maximum);
      expect(validator.isValid('x'.repeat(maximum))).toBe(true);
      expect(validator.isValid('x'.repeat(maximum + 1))).toBe(false);
      expect(validator.isValid(`safe\u001b`)).toBe(false);
    },
  );

  it('should cap the create dialog and expose every approved field bound', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showCreateUserDialog(application, new AbortController().signal);
    await settle();
    const dialog = activeDialog(application);
    const inputs = descendants(dialog).filter((view) => view instanceof Input);

    expect(dialog.bounds.width).toBeLessThanOrEqual(80);
    expect(dialog.bounds.height).toBeLessThanOrEqual(24);
    expect(inputs.map((input) => input.getMaxLength())).toEqual(
      expect.arrayContaining([255, 128, 2_048, 500, 50, 20, 2]),
    );
    application.loop.endModal('cancel');
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });

  it('should mask passwords and clear signals when the caller aborts', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const controller = new AbortController();
    const result = showSetUserPasswordDialog(application, controller.signal, 'alice@example.test');
    await settle();
    const inputs = descendants(activeDialog(application)).filter((view) => view instanceof Input);
    inputs[0]?.getValueSignal().set('NeverRender-123');
    inputs[1]?.getValueSignal().set('NeverRender-123');
    await settle();

    expect(frameText(application)).not.toContain('NeverRender-123');
    controller.abort();
    await expect(result).resolves.toEqual({ kind: 'cancel' });
    expect(application.desktop.activeWindow()).toBeNull();
    expect(inputs.map((input) => input.getValueSignal().peek())).toEqual(['', '']);
  });

  it('should render invitation preview text without accepting an HTML field', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const result = showInviteUserDialog(application, new AbortController().signal, async () => ({
      kind: 'success',
      value: { subject: 'Welcome', text: 'Safe plain text' },
    }));
    await settle();
    const invite = activeDialog(application);
    const inputs = descendants(invite).filter((view) => view instanceof Input);
    inputs[0]?.getValueSignal().set('alice@example.test');
    const preview = descendants(invite)
      .filter((view) => view instanceof Button)
      .find((button) => button.activation.label === 'Preview');
    if (!preview) throw new Error('Preview control missing.');
    application.loop.focusView(preview);
    application.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();

    expect(frameText(application)).toContain('Safe plain text');
    expect(frameText(application)).not.toContain('<html>');
    application.loop.endModal('ok');
    await settle();
    application.loop.endModal('cancel');
    await expect(result).resolves.toEqual({ kind: 'cancel' });
  });

  it('should quarantine a delayed preview after the invite form is cancelled', async () => {
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    let resolvePreview:
      | ((value: {
          readonly kind: 'success';
          readonly value: { readonly subject: string; readonly text: string };
        }) => void)
      | undefined;
    const preview = new Promise<{
      readonly kind: 'success';
      readonly value: { readonly subject: string; readonly text: string };
    }>((resolve) => {
      resolvePreview = resolve;
    });
    const result = showInviteUserDialog(
      application,
      new AbortController().signal,
      async () => preview,
    );
    await settle();
    const invite = activeDialog(application);
    const inputs = descendants(invite).filter((view) => view instanceof Input);
    inputs[0]?.getValueSignal().set('alice@example.test');
    const buttons = descendants(invite).filter((view) => view instanceof Button);
    const previewButton = buttons.find((button) => button.activation.label === 'Preview');
    const inviteButton = buttons.find((button) => button.activation.label === 'Invite');
    if (!previewButton || !inviteButton) throw new Error('Invite actions missing.');
    application.loop.focusView(previewButton);
    application.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });
    await settle();

    application.loop.dispatch({ type: 'key', key: 'i', ctrl: false, alt: true, shift: false });
    await settle();
    expect(application.desktop.activeWindow()).toBe(invite);

    application.loop.endModal('cancel');
    await expect(result).resolves.toEqual({ kind: 'cancel' });
    resolvePreview?.({ kind: 'success', value: { subject: 'Stale', text: 'STALE-PREVIEW' } });
    await settle();
    expect(application.desktop.activeWindow()).toBeNull();
    expect(frameText(application)).not.toContain('STALE-PREVIEW');
  });

  it('should make purge cancellation the default focus and fully tear down on cancel', async () => {
    const application = createApplication({ viewport: { width: 48, height: 12 } });
    const result = showPurgeUserDialog(
      application,
      new AbortController().signal,
      'alice@example.test',
    );
    await settle();
    const dialog = activeDialog(application);

    expect(dialog.bounds.width).toBeLessThanOrEqual(48);
    expect(dialog.bounds.height).toBeLessThanOrEqual(12);
    expect((application.loop.getFocused() as Button).activation.label).toBe('Cancel');
    application.loop.endModal('cancel');
    await expect(result).resolves.toEqual({ kind: 'cancel' });
    expect(application.desktop.activeWindow()).toBeNull();
  });
});
