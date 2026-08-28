/** Lifecycle and command routing for one embedded administration application. */

import { createHost, cursor, resolveCapabilities } from '@jsvision/core';
import type { CapabilityProfile } from '@jsvision/core';
import { Commands, confirm, createApplication, createKeymap, inputBox, signal } from '@jsvision/ui';
import type {
  Application,
  ApplicationOptions,
  ModalDialogHost,
  Size2D,
  Validator,
} from '@jsvision/ui';
import type { LoginInteraction } from '../auth/login-coordinator.js';
import { normalizeServerOrigin } from '../global-options.js';
import { showWhoAmIDialog } from './organization-dialogs.js';
import { ADMIN_COMMANDS, createAdminPresentation } from './presentation.js';
import { canRetryAdminState, type AdminConnectionState } from './state.js';

/** Supported administration process outcomes. */
export type AdminExitCode = 0 | 1 | 2 | 129 | 130 | 143;

/** UI-neutral asynchronous session operations consumed by the application. */
export interface AdminApplicationSession {
  /** Verifies a stored credential against live UserInfo at startup. */
  readonly verify?: (signal: AbortSignal) => Promise<AdminConnectionState | undefined>;
  /** Starts a fresh login and returns only verified application state. */
  readonly authenticate?: (signal: AbortSignal) => Promise<AdminConnectionState | undefined>;
  /** Repeats a transient, safely repeatable session operation. */
  readonly retry?: (signal: AbortSignal) => Promise<AdminConnectionState | undefined>;
  /** Starts a fresh replacement login for an existing verified identity. */
  readonly reauthenticate?: (signal: AbortSignal) => Promise<AdminConnectionState | undefined>;
}

/** State and operations prepared after the application has a selected server. */
export interface PreparedAdminApplicationSession {
  /** State shown while any stored credential is verified. */
  readonly initialState: AdminConnectionState;
  /** Server-bound session operations. */
  readonly session: AdminApplicationSession;
}

/** Narrow process signal boundary used by production and lifecycle tests. */
export interface AdminSignalSource {
  /** Registers one temporary signal listener. */
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  /** Removes a previously registered signal listener. */
  off(signal: NodeJS.Signals, listener: () => void): unknown;
}

/** Dependencies and initial values for one administration application. */
export interface AdminApplicationOptions {
  /** Normalized Porta server, or omission when the application must ask on first use. */
  readonly server?: URL;
  /** Whether TLS certificate validation was explicitly disabled. */
  readonly insecure: boolean;
  /** Explicit warning intent passed by the command preflight. */
  readonly showInsecureWarning?: boolean;
  /** Optional deterministic viewport used by headless tests. */
  readonly viewport?: Size2D;
  /** Initial verified or unauthenticated state. */
  readonly initialState?: AdminConnectionState;
  /** Shared UI-neutral session operations. */
  readonly session?: AdminApplicationSession;
  /** Builds server-bound operations after the UI interaction boundary exists. */
  readonly prepareSession?: (
    server: URL,
    interaction: LoginInteraction,
  ) => PreparedAdminApplicationSession;
  /** Optional server-selection seam; production uses a JSVision input dialog. */
  readonly selectServer?: (
    interaction: AdminApplicationInteraction,
    signal: AbortSignal,
  ) => Promise<URL | undefined>;
  /** Injectable factory used to construct the real JSVision application. */
  readonly applicationFactory?: (options: ApplicationOptions) => Application;
  /** Injectable run boundary used by headless tests. */
  readonly applicationRunner?: (application: Application) => Promise<number>;
  /** Injectable idempotent teardown boundary. */
  readonly applicationFinalizer?: (application: Application) => Promise<void> | void;
  /** Injectable process signal boundary. */
  readonly signalSource?: AdminSignalSource;
  /** Platform used to select portable signal behavior. */
  readonly platform?: NodeJS.Platform;
}

/** Dialog interactions owned by the live administration application. */
export interface AdminApplicationInteraction extends LoginInteraction {
  /** Asks for and validates the first Porta server origin. */
  readonly selectServer: (signal: AbortSignal) => Promise<URL | undefined>;
}

/** Signal-to-shell exit mappings used on supported POSIX hosts. */
const POSIX_SIGNAL_CODES = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
} as const satisfies Partial<Record<NodeJS.Signals, AdminExitCode>>;

/** Converts an arbitrary application result to a documented process outcome. */
function normalizeExitCode(value: number): AdminExitCode {
  return value === 1 || value === 2 || value === 129 || value === 130 || value === 143 ? value : 0;
}

/** Runs the native terminal host while letting the application finish signal cancellation first. */
async function runNativeAdminApplication(
  application: Application,
  caps: CapabilityProfile,
  onSignal: (code: AdminExitCode) => void,
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
    onBeforeExit: (code) => onSignal(normalizeExitCode(code)),
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

/** Converts a cancelled dialog into the same cancellation used by the login coordinator. */
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
function createAdminInteraction(
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

/** Creates the shared modal surface over the administration landing view. */
function createAdminDialogHost(
  application: Application,
  presentation: ReturnType<typeof createAdminPresentation>,
): ModalDialogHost {
  return {
    i18n: application.i18n,
    loop: application.loop,
    desktop: {
      addWindow: (window) => presentation.content.add(window),
      removeWindow: (window) => presentation.content.remove(window),
      get bounds() {
        return presentation.content.bounds;
      },
    },
  };
}

/** Starts one administration application and always releases its resources. */
export async function runAdminApplication(
  options: AdminApplicationOptions,
): Promise<AdminExitCode> {
  let server = options.server ? normalizeServerOrigin(options.server) : undefined;
  const initialState =
    options.initialState ??
    (server ? { kind: 'unauthenticated', server } : { kind: 'selecting-server' });
  const caps = resolveCapabilities().profile;
  const presentation = createAdminPresentation(
    initialState,
    options.showInsecureWarning ?? options.insecure,
    options.viewport,
    caps.unicode.utf8,
  );
  const factory = options.applicationFactory ?? createApplication;
  const application = factory({
    content: presentation.content,
    menuBar: presentation.menu,
    statusLine: presentation.status,
    viewport: options.viewport,
    systemClipboard: false,
    caps,
    keymap: createKeymap({
      'ctrl+t': ADMIN_COMMANDS.retry,
      'ctrl+r': ADMIN_COMMANDS.reauthenticate,
      'alt+x': Commands.quit,
    }),
  });
  const dialogHost = createAdminDialogHost(application, presentation);
  const interaction = createAdminInteraction(application, dialogHost);

  let disposed = false;
  let finalized = false;
  let currentController: AbortController | undefined;
  let currentOperationFallback: AdminConnectionState | undefined;
  let session = options.session;
  let signalExitCode: AdminExitCode | undefined;

  /** Updates presentation and command availability together. */
  const setState = (state: AdminConnectionState): void => {
    if (disposed) return;
    presentation.setState(state);
    application.loop.enableCommand(ADMIN_COMMANDS.authenticate, state.kind === 'unauthenticated');
    application.loop.enableCommand(ADMIN_COMMANDS.retry, canRetryAdminState(state));
    application.loop.enableCommand(
      ADMIN_COMMANDS.reauthenticate,
      state.kind === 'authenticated' || state.kind === 'unauthorized',
    );
    application.loop.enableCommand(ADMIN_COMMANDS.whoAmI, state.kind === 'authenticated');
    application.loop.enableCommand(
      ADMIN_COMMANDS.createOrganization,
      state.kind === 'authenticated' && state.capabilities.canCreateOrganizations,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.switchOrganization,
      state.kind === 'authenticated' && state.capabilities.canReadOrganizations,
    );
    application.loop.enableCommand(ADMIN_COMMANDS.cancel, currentController !== undefined);
  };

  /** Runs at most one caller-cancellable session operation at a time. */
  const startOperation = (
    operation: ((signal: AbortSignal) => Promise<AdminConnectionState | undefined>) | undefined,
    preserveCurrentState = false,
  ): void => {
    if (!operation || currentController || disposed) return;
    const operationServer = server;
    if (!operationServer) return;
    const controller = new AbortController();
    currentController = controller;
    currentOperationFallback = preserveCurrentState ? presentation.getState() : undefined;
    if (!preserveCurrentState) {
      setState({ kind: 'authenticating', server: operationServer, canCancel: true });
    } else {
      setState(presentation.getState());
    }
    void operation(controller.signal)
      .then((state) => {
        if (state && !disposed && currentController === controller && !controller.signal.aborted) {
          setState(state);
        }
      })
      .catch(() => {
        if (!disposed && currentController === controller && !controller.signal.aborted) {
          setState(
            currentOperationFallback ?? {
              kind: 'unauthenticated',
              server: operationServer,
              reason: 'unavailable',
            },
          );
        }
      })
      .finally(() => {
        if (currentController === controller) {
          currentController = undefined;
          currentOperationFallback = undefined;
          setState(presentation.getState());
        }
      });
  };

  const unregisterCommands = [
    application.onCommand(ADMIN_COMMANDS.authenticate, () => startOperation(session?.authenticate)),
    application.onCommand(ADMIN_COMMANDS.retry, () => startOperation(session?.retry)),
    application.onCommand(ADMIN_COMMANDS.reauthenticate, () =>
      startOperation(session?.reauthenticate, true),
    ),
    application.onCommand(ADMIN_COMMANDS.whoAmI, () => {
      const state = presentation.getState();
      if (state.kind !== 'authenticated' || currentController || disposed) return;
      void showWhoAmIDialog(
        dialogHost,
        state,
        options.showInsecureWarning ?? options.insecure,
      ).catch(() => undefined);
    }),
    application.onCommand(ADMIN_COMMANDS.cancel, () => {
      const fallback = currentOperationFallback;
      currentController?.abort();
      currentController = undefined;
      currentOperationFallback = undefined;
      if (fallback) {
        setState(fallback);
      } else if (server) {
        setState({ kind: 'unauthenticated', server });
      }
    }),
    application.onCommand(Commands.quit, () => currentController?.abort()),
  ];

  setState(initialState);
  /** Selects a first-run server or prepares the supplied server before verification. */
  const initialize = async (): Promise<void> => {
    if (!server) {
      const controller = new AbortController();
      currentController = controller;
      setState({ kind: 'selecting-server' });
      const selected = await (options.selectServer?.(interaction, controller.signal) ??
        interaction.selectServer(controller.signal));
      if (controller.signal.aborted || disposed) {
        if (!disposed) application.loop.emitCommand(Commands.quit);
        return;
      }
      currentController = undefined;
      if (!selected) {
        application.loop.emitCommand(Commands.quit);
        return;
      }
      server = normalizeServerOrigin(selected);
    }
    const prepared = options.prepareSession?.(server, interaction);
    if (prepared) {
      session = prepared.session;
      setState(prepared.initialState);
      if (prepared.initialState.kind === 'verifying') startOperation(session.verify, true);
      return;
    }
    if (initialState.kind === 'verifying') startOperation(session?.verify, true);
    else if (initialState.kind === 'selecting-server')
      setState({ kind: 'unauthenticated', server });
  };
  void initialize().catch(() => {
    if (!disposed) setState({ kind: 'fatal', failure: { kind: 'configuration-failure' } });
  });

  const signalSource = options.signalSource ?? process;
  const signalListeners = new Map<NodeJS.Signals, () => void>();
  const usesInjectedRunner = options.applicationRunner !== undefined;
  if (
    (usesInjectedRunner || options.signalSource !== undefined) &&
    (options.platform ?? process.platform) !== 'win32'
  ) {
    for (const [signal, exitCode] of Object.entries(POSIX_SIGNAL_CODES)) {
      const listener = (): void => {
        if (signalExitCode !== undefined) return;
        signalExitCode = exitCode;
        currentController?.abort();
        application.loop.emitCommand(Commands.quit, exitCode);
      };
      signalListeners.set(signal as NodeJS.Signals, listener);
      signalSource.once(signal as NodeJS.Signals, listener);
    }
  }

  /** Removes handlers and tears down the application exactly once. */
  const finalize = async (): Promise<void> => {
    if (finalized) return;
    finalized = true;
    disposed = true;
    currentController?.abort();
    for (const [signal, listener] of signalListeners) signalSource.off(signal, listener);
    for (const unregister of unregisterCommands) unregister();
    const finalizer = options.applicationFinalizer ?? ((target) => target.loop.dispose());
    await finalizer(application);
  };

  try {
    const result = await (options.applicationRunner?.(application) ??
      runNativeAdminApplication(application, caps, (exitCode) => {
        if (signalExitCode !== undefined) return;
        signalExitCode = exitCode;
        currentController?.abort();
        application.loop.emitCommand(Commands.quit, exitCode);
      }));
    return signalExitCode ?? normalizeExitCode(result);
  } catch {
    throw new Error('Administration application failed.');
  } finally {
    await finalize();
  }
}
