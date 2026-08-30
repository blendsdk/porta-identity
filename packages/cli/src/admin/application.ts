/** Lifecycle and command routing for one embedded administration application. */

import { resolveCapabilities } from '@jsvision/core';
import type { Keymap } from '@jsvision/core';
import { Commands, createApplication, createKeymap } from '@jsvision/ui';
import type { Application, ApplicationOptions, Size2D } from '@jsvision/ui';
import type { LoginInteraction } from '../auth/login-coordinator.js';
import { normalizeServerOrigin } from '../global-options.js';
import {
  createAdminDialogSurface,
  createAdminInteraction,
  runNativeAdminApplication,
} from './application-runtime.js';
import type { AdminApplicationInteraction } from './application-runtime.js';
import {
  showAuthenticationGate,
  showCreateOrganizationDialog,
  showOrganizationChooser,
  showWhoAmIDialog,
} from './organization-dialogs.js';
import type { AdminOrganizationOperations } from './organization-service.js';
import type { AdminUserOperations } from './user-service.js';
import type { AdminApplicationOperations } from './application-service.js';
import type { AdminClientOperations } from './client-service.js';
import { createAdminApplicationClientFeatures } from './application-client-features.js';
import type { AdminApplicationClientFeatures } from './application-client-features.js';
import { createAdminUserController } from './user-controller.js';
import type { AdminUserController } from './user-controller.js';
import { ADMIN_COMMANDS, createAdminPresentation } from './presentation.js';
import {
  canRetryAdminState,
  type AdminConnectionState,
  type AdminOrganizationContext,
  type AdminOrganizationFailureKind,
} from './state.js';

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
  /** Organization operations bound lazily to the verified server session. */
  readonly organizations?: AdminOrganizationOperations;
  /** User operations bound lazily to the verified server session. */
  readonly users?: AdminUserOperations;
  /** Global application operations bound lazily to the verified server session. */
  readonly applications?: AdminApplicationOperations;
  /** Selected-organization client operations bound lazily to the verified server session. */
  readonly clients?: AdminClientOperations;
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

export type { AdminApplicationInteraction } from './application-runtime.js';

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
  let currentController: AbortController | undefined;
  let organizationDialogOpen = false;
  let userDialogOpen = false;
  let authenticationGateOpen = false;
  let identityDialogOpen = false;
  let disposed = false;
  let emitDeferredQuit = (): void => undefined;
  let deferredQuit = false;
  let userController: AdminUserController | undefined;
  let applicationClientFeatures: AdminApplicationClientFeatures | undefined;
  let userRecoveryRequired = false;
  let featureDialogOpen = false;
  let sessionEpoch = initialState.kind === 'authenticated' ? 1 : 0;
  const standardKeymap = createKeymap({
    'ctrl+r': ADMIN_COMMANDS.reauthenticate,
    'alt+x': Commands.quit,
  });
  const applicationKeymap: Keymap = {
    // Dialogs handle Cancel themselves, but not the global Quit command. Convert Alt-X to Cancel for
    // the active modal, then re-emit Quit after that modal has left the event loop's modal scope.
    lookup: (event) => {
      const command = standardKeymap.lookup(event);
      const modalWorkOpen =
        currentController !== undefined ||
        authenticationGateOpen ||
        organizationDialogOpen ||
        identityDialogOpen ||
        userDialogOpen ||
        featureDialogOpen;
      const cancellableWorkOpen =
        currentController !== undefined || organizationDialogOpen || userDialogOpen || featureDialogOpen;
      if (command === Commands.quit && modalWorkOpen) {
        if (!deferredQuit) {
          deferredQuit = true;
          queueMicrotask(() => {
            deferredQuit = false;
            if (!disposed) emitDeferredQuit();
          });
        }
        return Commands.cancel;
      }
      // Escape remains a raw dialog key unless an application operation currently owns cancellation.
      return event.key === 'escape' && cancellableWorkOpen ? ADMIN_COMMANDS.cancel : command;
    },
  };
  const factory = options.applicationFactory ?? createApplication;
  const application = factory({
    content: presentation.content,
    menuBar: presentation.menu,
    statusLine: presentation.status,
    viewport: options.viewport,
    systemClipboard: false,
    caps,
    keymap: applicationKeymap,
  });
  emitDeferredQuit = () => application.loop.emitCommand(Commands.quit);
  // Keep a stable background focus target so menus remain keyboard-accessible after a modal closes.
  application.loop.focusInto(presentation.content);
  const dialogSurface = createAdminDialogSurface(application, presentation);
  const dialogHost = dialogSurface.host;
  const interaction = createAdminInteraction(application, dialogHost);

  let finalized = false;
  let initialized = false;
  let currentOperationFallback: AdminConnectionState | undefined;
  let authenticationGateGeneration = 0;
  let organizationGeneration = 0;
  let createRecoveryRequired = false;
  let deferAuthenticationGateOnce = false;
  let session = options.session;
  let signalExitCode: AdminExitCode | undefined;

  /** Updates presentation and command availability together. */
  const setState = (state: AdminConnectionState): void => {
    if (disposed) return;
    presentation.setState(state);
    userController?.syncContext(state, sessionEpoch);
    applicationClientFeatures?.syncContext(state, sessionEpoch);
    application.loop.enableCommand(ADMIN_COMMANDS.authenticate, state.kind === 'unauthenticated');
    application.loop.enableCommand(ADMIN_COMMANDS.retry, canRetryAdminState(state));
    application.loop.enableCommand(
      ADMIN_COMMANDS.reauthenticate,
      state.kind === 'authenticated' || state.kind === 'unauthorized',
    );
    application.loop.enableCommand(ADMIN_COMMANDS.whoAmI, state.kind === 'authenticated');
    application.loop.enableCommand(
      ADMIN_COMMANDS.createOrganization,
      state.kind === 'authenticated' &&
        state.capabilities.canCreateOrganizations &&
        !createRecoveryRequired &&
        !organizationDialogOpen &&
        !currentController &&
        !userDialogOpen,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.switchOrganization,
      state.kind === 'authenticated' &&
        state.capabilities.canReadOrganizations &&
        !organizationDialogOpen &&
        !currentController &&
        !userDialogOpen,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.browseUsers,
      state.kind === 'authenticated' &&
        Boolean(state.organization) &&
        state.capabilities.canReadUsers &&
        !userDialogOpen &&
        !organizationDialogOpen &&
        !currentController,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.createUser,
      state.kind === 'authenticated' &&
        Boolean(state.organization) &&
        state.capabilities.canCreateUsers &&
        !userDialogOpen &&
        !organizationDialogOpen &&
        !currentController &&
        !userRecoveryRequired,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.inviteUser,
      state.kind === 'authenticated' &&
        Boolean(state.organization) &&
        state.capabilities.canInviteUsers &&
        !userDialogOpen &&
        !organizationDialogOpen &&
        !currentController &&
        !userRecoveryRequired,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.cancel,
      currentController !== undefined || organizationDialogOpen || userDialogOpen || featureDialogOpen,
    );
    const featureIdle =
      !currentController &&
      !organizationDialogOpen &&
      !identityDialogOpen &&
      !userDialogOpen &&
      !featureDialogOpen;
    application.loop.enableCommand(
      ADMIN_COMMANDS.browseApplications,
      state.kind === 'authenticated' && state.capabilities.canReadApplications && featureIdle,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.createApplication,
      state.kind === 'authenticated' && state.capabilities.canCreateApplications && featureIdle,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.browseClients,
      state.kind === 'authenticated' &&
        Boolean(state.organization) &&
        state.capabilities.canReadClients &&
        featureIdle,
    );
    application.loop.enableCommand(
      ADMIN_COMMANDS.createClient,
      state.kind === 'authenticated' &&
        Boolean(state.organization) &&
        state.capabilities.canCreateClients &&
        state.capabilities.canReadApplications &&
        featureIdle,
    );
    syncAuthenticationGate(state);
  };

  /** Builds authenticated state without retaining a stale organization failure. */
  const authenticatedState = (
    state: Extract<AdminConnectionState, { readonly kind: 'authenticated' }>,
    organization?: AdminOrganizationContext,
    organizationFailure?: AdminOrganizationFailureKind,
  ): AdminConnectionState => ({
    kind: 'authenticated',
    server: state.server,
    identity: state.identity,
    capabilities: state.capabilities,
    ...(organization ? { organization } : {}),
    ...(organizationFailure ? { organizationFailure } : {}),
  });

  /** Returns true while a logical organization operation may still publish a result. */
  const ownsOrganizationGeneration = (generation: number): boolean =>
    !disposed && organizationDialogOpen && generation === organizationGeneration;

  /** Closes the current organization modal and rejects all of its late continuations. */
  const cancelOrganizationWork = (): void => {
    if (!organizationDialogOpen) return;
    organizationGeneration += 1;
    organizationDialogOpen = false;
    application.loop.endModal(Commands.cancel);
    dialogSurface.removeAll();
    setState(presentation.getState());
  };

  /** Closes the read-only identity dialog before a synchronous terminal redraw. */
  const cancelIdentityDialog = (): void => {
    if (!identityDialogOpen) return;
    identityDialogOpen = false;
    application.loop.endModal(Commands.cancel);
    dialogSurface.removeAll();
    setState(presentation.getState());
  };

  /** Closes the authentication gate and rejects its pending continuation. */
  const cancelAuthenticationGate = (): void => {
    if (!authenticationGateOpen) return;
    authenticationGateGeneration += 1;
    authenticationGateOpen = false;
    application.loop.endModal(Commands.cancel);
    dialogSurface.removeAll();
  };

  /** Aborts authentication and restores its safe fallback without leaving a mounted dialog. */
  const cancelSessionOperation = (): void => {
    if (!currentController) return;
    const fallback = currentOperationFallback;
    currentController.abort();
    currentController = undefined;
    currentOperationFallback = undefined;
    dialogSurface.removeAll();
    if (fallback) setState(fallback);
    else if (server) setState({ kind: 'unauthenticated', server });
    else setState(presentation.getState());
  };

  /** Cancels whichever single modal or operation currently owns the application surface. */
  const cancelModalWork = (): void => {
    cancelAuthenticationGate();
    cancelIdentityDialog();
    cancelOrganizationWork();
    cancelSessionOperation();
    userController?.cancelActiveOperation();
    applicationClientFeatures?.cancelActiveOperation();
    dialogSurface.removeAll();
  };

  /** Opens the gate exactly once when the application is usable but not authenticated. */
  function syncAuthenticationGate(state = presentation.getState()): void {
    const recoverable =
      presentation.content.bounds.width >= 32 && presentation.content.bounds.height >= 8;
    if (
      !initialized ||
      disposed ||
      state.kind !== 'unauthenticated' ||
      !recoverable ||
      currentController ||
      authenticationGateOpen ||
      organizationDialogOpen ||
      identityDialogOpen ||
      userDialogOpen ||
      featureDialogOpen
    ) {
      return;
    }
    if (deferAuthenticationGateOnce) {
      deferAuthenticationGateOnce = false;
      setTimeout(() => syncAuthenticationGate(), 0);
      return;
    }

    const generation = ++authenticationGateGeneration;
    authenticationGateOpen = true;
    void showAuthenticationGate(dialogHost)
      .then((choice) => {
        if (disposed || !authenticationGateOpen || generation !== authenticationGateGeneration) {
          return;
        }
        authenticationGateOpen = false;
        if (choice === 'quit') {
          application.loop.emitCommand(Commands.quit);
          return;
        }
        if (session?.authenticate) startOperation(session.authenticate);
        else syncAuthenticationGate();
      })
      .catch(() => {
        if (generation === authenticationGateGeneration) {
          authenticationGateOpen = false;
          application.loop.emitCommand(Commands.quit);
        }
      });
  }

  /** Enters the established unauthenticated state after a final organization 401. */
  const invalidateSession = (): void => {
    sessionEpoch += 1;
    createRecoveryRequired = false;
    cancelOrganizationWork();
    const operationServer = server;
    if (operationServer) setState({ kind: 'unauthenticated', server: operationServer });
  };

  /** Opens the bounded create form and owns exactly one submitted service call. */
  function startCreateOrganization(): void {
    const state = presentation.getState();
    const operations = session?.organizations;
    if (
      state.kind !== 'authenticated' ||
      !state.capabilities.canCreateOrganizations ||
      createRecoveryRequired ||
      !operations ||
      currentController ||
      authenticationGateOpen ||
      organizationDialogOpen ||
      identityDialogOpen ||
      userDialogOpen ||
      disposed
    ) {
      return;
    }

    const generation = ++organizationGeneration;
    organizationDialogOpen = true;
    setState(state);
    void showCreateOrganizationDialog(dialogHost)
      .then(async (choice) => {
        if (!ownsOrganizationGeneration(generation) || choice.kind === 'cancel') return;
        createRecoveryRequired = true;
        setState(presentation.getState());
        const result = await operations.create(choice.input);
        if (!ownsOrganizationGeneration(generation)) return;
        if (result.kind === 'session-invalid') {
          invalidateSession();
          return;
        }
        if (result.kind === 'success') {
          createRecoveryRequired = false;
          setState(authenticatedState(state, result.value));
          return;
        }
        createRecoveryRequired =
          result.failure === 'unavailable' || result.failure === 'invalid-response';
        setState(authenticatedState(state, state.organization, result.failure));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ownsOrganizationGeneration(generation)) return;
        organizationDialogOpen = false;
        setState(presentation.getState());
      });
  }

  /** Opens organization choice with one complete, order-preserving list request when authorized. */
  function startOrganizationChooser(): void {
    const state = presentation.getState();
    const operations = session?.organizations;
    if (
      state.kind !== 'authenticated' ||
      !operations ||
      currentController ||
      authenticationGateOpen ||
      organizationDialogOpen ||
      identityDialogOpen ||
      userDialogOpen ||
      disposed
    ) {
      return;
    }

    const generation = ++organizationGeneration;
    organizationDialogOpen = true;
    setState(state);
    const organizations = state.capabilities.canReadOrganizations
      ? operations.listAll()
      : undefined;
    if (organizations) {
      void organizations.then((result) => {
        if (!ownsOrganizationGeneration(generation)) return;
        if (result.kind === 'session-invalid') {
          invalidateSession();
        } else if (result.kind === 'success') {
          createRecoveryRequired = false;
          setState(presentation.getState());
        }
      });
    }

    let next: 'create' | 'reauthenticate' | undefined;
    void showOrganizationChooser(dialogHost, {
      capabilities: state.capabilities,
      ...(organizations ? { organizations } : {}),
    })
      .then((choice) => {
        if (!ownsOrganizationGeneration(generation)) return;
        if (choice.kind === 'switch') {
          setState(authenticatedState(state, choice.organization));
        } else if (choice.kind === 'create') {
          next = 'create';
        } else if (choice.kind === 'reauthenticate') {
          next = 'reauthenticate';
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ownsOrganizationGeneration(generation)) return;
        organizationDialogOpen = false;
        setState(presentation.getState());
        if (next === 'create') startCreateOrganization();
        else if (next === 'reauthenticate') startReauthentication();
      });
  }

  /** Runs at most one caller-cancellable session operation at a time. */
  const startOperation = (
    operation: ((signal: AbortSignal) => Promise<AdminConnectionState | undefined>) | undefined,
    preserveCurrentState = false,
  ): void => {
    if (
      !operation ||
      currentController ||
      authenticationGateOpen ||
      organizationDialogOpen ||
      identityDialogOpen ||
      userDialogOpen ||
      disposed
    )
      return;
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
    let openOrganizationChoice = false;
    void operation(controller.signal)
      .then((state) => {
        if (state && !disposed && currentController === controller && !controller.signal.aborted) {
          if (state.kind === 'authenticated') sessionEpoch += 1;
          setState(state);
          openOrganizationChoice = state.kind === 'authenticated' && !state.organization;
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
          if (openOrganizationChoice) startOrganizationChooser();
        }
      });
  };

  /** Reauthenticates and reconciles an existing organization before releasing operation ownership. */
  function startReauthentication(): void {
    applicationClientFeatures?.cancelActiveOperation();
    const operation = session?.reauthenticate;
    if (
      !operation ||
      currentController ||
      authenticationGateOpen ||
      organizationDialogOpen ||
      identityDialogOpen ||
      userDialogOpen ||
      disposed
    )
      return;
    const operationServer = server;
    if (!operationServer) return;
    const previous = presentation.getState();
    const controller = new AbortController();
    currentController = controller;
    currentOperationFallback = previous;
    setState(previous);
    let openOrganizationChoice = false;

    /** Releases reauthentication ownership before a follow-up chooser may open. */
    const release = (): void => {
      if (currentController !== controller) return;
      currentController = undefined;
      currentOperationFallback = undefined;
      setState(presentation.getState());
      if (openOrganizationChoice) startOrganizationChooser();
    };

    void operation(controller.signal)
      .then(async (state) => {
        if (!state || disposed || currentController !== controller || controller.signal.aborted) {
          return;
        }
        if (state.kind !== 'authenticated') {
          sessionEpoch += 1;
          deferAuthenticationGateOnce = state.kind === 'unauthenticated';
          setState(state);
          release();
          return;
        }
        sessionEpoch += 1;
        if (previous.kind !== 'authenticated' || !previous.organization) {
          setState(state);
          openOrganizationChoice = !state.organization;
          release();
          return;
        }

        const sameSubject = state.identity.sub === previous.identity.sub;
        const replacement = authenticatedState(
          state,
          sameSubject ? previous.organization : undefined,
        );
        setState(replacement);
        const operations = session?.organizations;
        if (!operations) {
          release();
          return;
        }
        const result = await operations.reconcile(previous.organization.id);
        if (disposed || currentController !== controller || controller.signal.aborted) return;
        if (result.kind === 'session-invalid') {
          createRecoveryRequired = false;
          setState({ kind: 'unauthenticated', server: operationServer });
        } else if (result.kind === 'match') {
          createRecoveryRequired = false;
          setState(authenticatedState(state, result.organization));
        } else if (
          result.kind === 'absent' ||
          result.kind === 'matching-invalid' ||
          (result.kind === 'failure' && result.failure === 'unauthorized')
        ) {
          setState(state);
          openOrganizationChoice = true;
        } else {
          setState(
            authenticatedState(
              state,
              sameSubject ? previous.organization : undefined,
              result.failure,
            ),
          );
        }
      })
      .catch(() => {
        if (!disposed && currentController === controller && !controller.signal.aborted) {
          setState(previous);
        }
      })
      .finally(release);
  }

  userController = createAdminUserController({
    host: dialogHost,
    readState: () => presentation.getState(),
    readOperations: () => session?.users,
    mountWorkspace: presentation.setUserWorkspace,
    isApplicationBusy: () =>
      Boolean(
        currentController || authenticationGateOpen || organizationDialogOpen || identityDialogOpen,
      ),
    setDialogBusy: (busy) => {
      userDialogOpen = busy;
      setState(presentation.getState());
    },
    requestAuthentication: invalidateSession,
    setRecoveryRequired: (required) => {
      userRecoveryRequired = required;
      setState(presentation.getState());
    },
  });

  applicationClientFeatures = createAdminApplicationClientFeatures({
    dialogs: dialogSurface,
    readState: () => presentation.getState(),
    readSession: () => session,
    mountWorkspace: presentation.setWorkspace,
    focusView: (view) => application.loop.focusInto(view),
    setDialogBusy: (busy) => {
      featureDialogOpen = busy;
      setState(presentation.getState());
    },
    requestAuthentication: invalidateSession,
  });
  dialogSurface.setModalCommandHandler((command) => {
    if (command !== ADMIN_COMMANDS.reauthenticate) return false;
    cancelModalWork();
    queueMicrotask(startReauthentication);
    return true;
  });

  const unregisterCommands = [
    application.onCommand(ADMIN_COMMANDS.authenticate, () => startOperation(session?.authenticate)),
    application.onCommand(ADMIN_COMMANDS.retry, () => startOperation(session?.retry)),
    application.onCommand(ADMIN_COMMANDS.reauthenticate, startReauthentication),
    application.onCommand(ADMIN_COMMANDS.whoAmI, () => {
      const state = presentation.getState();
      if (
        state.kind !== 'authenticated' ||
        currentController ||
        authenticationGateOpen ||
        organizationDialogOpen ||
        identityDialogOpen ||
        userDialogOpen ||
        disposed
      )
        return;
      identityDialogOpen = true;
      void showWhoAmIDialog(dialogHost, state, options.showInsecureWarning ?? options.insecure)
        .catch(() => undefined)
        .finally(() => {
          identityDialogOpen = false;
          if (!disposed) setState(presentation.getState());
        });
    }),
    application.onCommand(ADMIN_COMMANDS.createOrganization, startCreateOrganization),
    application.onCommand(ADMIN_COMMANDS.switchOrganization, startOrganizationChooser),
    application.onCommand(ADMIN_COMMANDS.browseUsers, () =>
      userController?.handleCommand(ADMIN_COMMANDS.browseUsers),
    ),
    application.onCommand(ADMIN_COMMANDS.createUser, () =>
      userController?.handleCommand(ADMIN_COMMANDS.createUser),
    ),
    application.onCommand(ADMIN_COMMANDS.inviteUser, () =>
      userController?.handleCommand(ADMIN_COMMANDS.inviteUser),
    ),
    application.onCommand(ADMIN_COMMANDS.browseApplications, () =>
      applicationClientFeatures?.handleCommand(ADMIN_COMMANDS.browseApplications),
    ),
    application.onCommand(ADMIN_COMMANDS.createApplication, () =>
      applicationClientFeatures?.handleCommand(ADMIN_COMMANDS.createApplication),
    ),
    application.onCommand(ADMIN_COMMANDS.browseClients, () =>
      applicationClientFeatures?.handleCommand(ADMIN_COMMANDS.browseClients),
    ),
    application.onCommand(ADMIN_COMMANDS.createClient, () =>
      applicationClientFeatures?.handleCommand(ADMIN_COMMANDS.createClient),
    ),
    application.onCommand(ADMIN_COMMANDS.cancel, () => {
      if (userDialogOpen) {
        userController?.cancelActiveOperation();
        return;
      }
      if (featureDialogOpen) {
        applicationClientFeatures?.cancelActiveOperation();
        return;
      }
      if (identityDialogOpen) {
        cancelIdentityDialog();
        return;
      }
      if (organizationDialogOpen) {
        cancelOrganizationWork();
        return;
      }
      cancelSessionOperation();
    }),
    application.onCommand(Commands.quit, () => {
      cancelModalWork();
    }),
  ];

  const resizeApplication = application.loop.onResize;
  application.loop.onResize = (size) => {
    resizeApplication?.(size);
    const recoverable =
      presentation.content.bounds.width >= 32 && presentation.content.bounds.height >= 8;
    userController?.handleRecoverableGeometry(recoverable);
    applicationClientFeatures?.handleRecoverableGeometry(recoverable);
    if (!recoverable) {
      cancelModalWork();
    } else {
      syncAuthenticationGate();
    }
  };

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
  void initialize()
    .then(() => {
      initialized = true;
      syncAuthenticationGate();
    })
    .catch(() => {
      initialized = true;
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
        cancelModalWork();
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
    cancelModalWork();
    disposed = true;
    userController?.dispose();
    userController = undefined;
    applicationClientFeatures?.dispose();
    applicationClientFeatures = undefined;
    dialogSurface.setModalCommandHandler(undefined);
    for (const [signal, listener] of signalListeners) signalSource.off(signal, listener);
    for (const unregister of unregisterCommands) unregister();
    const finalizer = options.applicationFinalizer ?? ((target) => target.loop.dispose());
    await finalizer(application);
  };

  try {
    const result = await (options.applicationRunner?.(application) ??
      runNativeAdminApplication(application, caps, (exitCode) => {
        if (signalExitCode !== undefined) return;
        signalExitCode = normalizeExitCode(exitCode);
        cancelModalWork();
        application.loop.emitCommand(Commands.quit, signalExitCode);
      }));
    return signalExitCode ?? normalizeExitCode(result);
  } catch {
    throw new Error('Administration application failed.');
  } finally {
    await finalize();
  }
}
