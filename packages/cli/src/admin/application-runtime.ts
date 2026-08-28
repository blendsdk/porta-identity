/** Native terminal host adapter for the embedded administration application. */

import { createHost, cursor } from '@jsvision/core';
import type { CapabilityProfile } from '@jsvision/core';
import { Commands, confirm, inputBox, signal } from '@jsvision/ui';
import type { Application, ModalDialogHost, Validator } from '@jsvision/ui';
import type { LoginInteraction } from '../auth/login-coordinator.js';
import { normalizeServerOrigin } from '../global-options.js';
import type { createAdminPresentation } from './presentation.js';

/** Dialog interactions owned by the live administration application. */
export interface AdminApplicationInteraction extends LoginInteraction {
  /** Asks for and validates the first Porta server origin. */
  readonly selectServer: (signal: AbortSignal) => Promise<URL | undefined>;
}

/** Converts a cancelled dialog into the cancellation used by the login coordinator. */
function cancelledInteraction(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

/** Closes an active modal promptly when its owning operation is cancelled. */
async function runAbortableDialog<T>(
  application: Application,
  signal_: AbortSignal,
  open: () => Promise<T>,
): Promise<T> {
  if (signal_.aborted) throw cancelledInteraction();
  const abort = (): void => application.loop.endModal(Commands.cancel);
  signal_.addEventListener('abort', abort, { once: true });
  try {
    return await open();
  } finally {
    signal_.removeEventListener('abort', abort);
  }
}

/** Creates the modal login and first-run interactions over the application body. */
export function createAdminInteraction(
  application: Application,
  dialogHost: ModalDialogHost,
): AdminApplicationInteraction {
  const serverValidator: Validator = {
    isValidInput: (value) => value.length <= 2_048,
    isValid: (value) => {
      try {
        normalizeServerOrigin(value);
        return true;
      } catch {
        return false;
      }
    },
    error: 'Enter a valid HTTPS Porta server origin.',
  };

  return {
    selectServer: async (operationSignal) => {
      const value = signal('https://');
      const selected = await runAbortableDialog(application, operationSignal, () =>
        inputBox(dialogHost, {
          title: 'Select Porta Server',
          label: '~S~erver origin',
          value,
          validator: serverValidator,
          placeholder: 'https://porta.example.com',
        }),
      );
      return selected === null ? undefined : normalizeServerOrigin(selected);
    },
    presentAuthorizationUrl: async (url, operationSignal) => {
      const value = signal(url.toString());
      const acknowledged = await runAbortableDialog(application, operationSignal, () =>
        inputBox(dialogHost, {
          title: 'Open Authorization URL',
          label: '~U~RL',
          value,
        }),
      );
      if (acknowledged === null) throw cancelledInteraction();
    },
    requestManualCallback: async (operationSignal) => {
      const value = signal('');
      const callback = await runAbortableDialog(application, operationSignal, () =>
        inputBox(dialogHost, {
          title: 'Complete Authentication',
          label: '~C~allback URL',
          value,
          placeholder: 'Paste the complete callback URL',
        }),
      );
      if (callback === null) throw cancelledInteraction();
      return callback;
    },
    confirmCredentialReplacement: (currentServer, nextServer, operationSignal) =>
      runAbortableDialog(application, operationSignal, () =>
        confirm(
          dialogHost,
          `Replace credentials for ${currentServer.origin} with ${nextServer.origin}?`,
        ),
      ),
  };
}

/** Shared modal surface plus synchronous removal used during resize and shutdown. */
export interface AdminDialogSurface {
  /** Host passed to ordinary JSVision dialog helpers. */
  readonly host: ModalDialogHost;
  /** Immediately removes every mounted dialog before a terminal redraw. */
  readonly removeAll: () => void;
}

/**
 * Creates the modal host over the administration landing view.
 *
 * @param application - Mounted JSVision application.
 * @param presentation - Landing presentation that owns modal windows.
 * @returns A standard dialog host and a synchronous teardown operation.
 */
export function createAdminDialogSurface(
  application: Application,
  presentation: ReturnType<typeof createAdminPresentation>,
): AdminDialogSurface {
  const windows = new Set<Parameters<ModalDialogHost['desktop']['addWindow']>[0]>();
  return {
    host: {
      i18n: application.i18n,
      loop: application.loop,
      desktop: {
        addWindow: (window) => {
          windows.add(window);
          presentation.content.add(window);
        },
        removeWindow: (window) => {
          if (windows.delete(window)) presentation.content.remove(window);
        },
        get bounds() {
          return presentation.content.bounds;
        },
      },
    },
    removeAll: () => {
      for (const window of windows) presentation.content.remove(window);
      windows.clear();
    },
  };
}

/**
 * Runs the native terminal host while allowing application-owned signal handling to finish first.
 *
 * @param application - Mounted JSVision application.
 * @param caps - Terminal capabilities shared with the renderer.
 * @param onSignal - Receives the terminal host's exit code before application shutdown.
 * @returns The application command-loop exit code.
 */
export async function runNativeAdminApplication(
  application: Application,
  caps: CapabilityProfile,
  onSignal: (code: number) => void,
): Promise<number> {
  const output = process.stdout;
  let lastCaret: { readonly x: number; readonly y: number } | null = null;
  let pendingFrame: Parameters<ReturnType<typeof createHost>['render']>[0] | null = null;
  let resolveQuit: (code: number) => void = () => undefined;
  const quit = new Promise<number>((resolve) => {
    resolveQuit = resolve;
  });
  const unregisterQuit = application.onCommand(Commands.quit, () => resolveQuit(0));
  const host = createHost({
    caps,
    input: process.stdin,
    output,
    exitOnSignal: false,
    warnAmbiguousWidth: true,
    adaptAmbiguousWidth: true,
    onInput: (event) => application.loop.dispatch(event),
    onResize: (event) => application.loop.resize({ width: event.columns, height: event.rows }),
    onResume: () => {
      output.write(
        lastCaret === null
          ? cursor.hide()
          : cursor.show() + cursor.to(lastCaret.y + 1, lastCaret.x + 1),
      );
    },
    onBeforeExit: onSignal,
  });

  application.loop.onFrame = (buffer) => {
    pendingFrame = buffer;
  };
  application.loop.onCaret = (cell) => {
    lastCaret = cell;
    const caret = cell === null ? cursor.hide() : cursor.show() + cursor.to(cell.y + 1, cell.x + 1);
    if (pendingFrame) {
      const frame = pendingFrame;
      pendingFrame = null;
      host.render(frame, caret);
    } else {
      output.write(caret);
    }
  };

  try {
    await host.start();
    host.render(application.loop.renderRoot.buffer());
    application.loop.refreshCaret();
    return await quit;
  } finally {
    application.loop.stop();
    await host.stop();
    application.loop.onFrame = undefined;
    application.loop.onCaret = undefined;
    unregisterQuit();
  }
}
