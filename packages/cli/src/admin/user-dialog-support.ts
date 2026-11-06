/** Shared primitives for bounded administration dialogs. */

import { Button, Commands, Dialog, fixed, grow, Input, Label, row } from '@jsvision/ui';
import type { EventLoop, ModalDialogHost } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';

/** Modal host used by user dialogs, including synchronous abort-driven closure. */
export interface AdminUserDialogHost extends ModalDialogHost {
  /** Event loop that can close the currently owned modal when its operation is aborted. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Returns a dialog size capped to the current terminal surface. */
export function dialogSize(
  host: AdminUserDialogHost,
  preferredWidth: number,
  preferredHeight: number,
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, Math.min(preferredWidth, host.desktop.bounds.width)),
    height: Math.max(1, Math.min(preferredHeight, host.desktop.bounds.height)),
  };
}

/** Validates bounded multiline text while rejecting terminal control sequences. */
export function validMultilineText(value: string, maximum: number): boolean {
  if (value.length > maximum) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x0a || codePoint === 0x0d) continue;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return false;
  }
  return true;
}

/** Creates one naturally sized trailing action row. */
export function actionRow(...buttons: Button[]): ReturnType<typeof fixed> {
  return fixed(row({ gap: 1, justify: 'end' }, ...buttons), 2);
}

/** Creates one padded form row with a stable label column. */
export function inputRow(label: string, input: Input): ReturnType<typeof fixed> {
  return fixed(row({ gap: 1 }, fixed(new Label(label, input), 18), grow(input)), 1);
}

/** Converts an abort into the ordinary dialog cancellation command. */
export async function runDialog(
  host: AdminUserDialogHost,
  dialog: Dialog,
  operationSignal: AbortSignal,
): Promise<string> {
  host.desktop.addWindow(dialog);
  try {
    return await runAbortableAdminDialog(
      host.loop,
      operationSignal,
      async () => (await host.loop.execView<string>(dialog)) ?? Commands.cancel,
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return Commands.cancel;
    throw error;
  } finally {
    host.desktop.removeWindow(dialog);
  }
}
