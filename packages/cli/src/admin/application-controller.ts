/** Operation ownership for the deployment-global application workflow. */

import type { AdminConnectionState } from './state.js';
import type { AdminApplicationOperations } from './application-service.js';
import type {
  AdminApplication,
  AdminApplicationMutationResult,
  AdminApplicationViewState,
} from './application-state.js';

/** Dependencies for one direct global application controller. */
export interface AdminApplicationControllerOptions {
  /** Reads the latest application-owned connection and capability state. */
  readonly readState: () => AdminConnectionState;
  /** Reads validated operations for the current verified session. */
  readonly readOperations: () => Partial<AdminApplicationOperations> | undefined;
  /** Publishes immutable feature state to the later workspace boundary. */
  readonly publishState: (state: AdminApplicationViewState) => void;
  /** Enters the existing authentication flow after final session invalidation. */
  readonly requestAuthentication: () => void;
  /** Gates later mutations until deliberate reload reconciles an unknown outcome. */
  readonly setRecoveryRequired?: (required: boolean) => void;
}

/** Application-owned global workflow boundary. */
export interface AdminApplicationController {
  /** Applies the latest connection and explicit verified-session epoch. */
  readonly syncContext: (state: AdminConnectionState, sessionEpoch: number) => void;
  /** Deliberately loads and reconciles the complete global catalog. */
  readonly load: () => Promise<void>;
  /** Confirms and activates one application at most once. */
  readonly activate: (applicationId: string, confirm: () => Promise<boolean>) => Promise<void>;
  /** Cancels the current read, confirmation, or mutation. */
  readonly cancelActiveOperation: () => void;
  /** Cancels ownership when the terminal enters resize-only recovery. */
  readonly handleRecoverableGeometry: (recoverable: boolean) => void;
  /** Invalidates all work and closes the feature state. */
  readonly dispose: () => void;
}

/** Creates the small global application workflow controller. */
export function createAdminApplicationController(
  options: AdminApplicationControllerOptions,
): AdminApplicationController {
  let sessionEpoch = -1;
  let generation = 0;
  let operation: AbortController | undefined;
  let applications: readonly AdminApplication[] | undefined;
  let recoveryRequired = false;
  let disposed = false;

  /** Publishes only while the controller still belongs to the application. */
  const publish = (state: AdminApplicationViewState): void => {
    if (!disposed) options.publishState(state);
  };

  /** Clears current asynchronous ownership. */
  const cancel = (): void => {
    generation += 1;
    operation?.abort();
    operation = undefined;
  };

  /** Returns true only for the current continuation. */
  const owns = (capturedGeneration: number, controller: AbortController): boolean =>
    !disposed &&
    generation === capturedGeneration &&
    operation === controller &&
    !controller.signal.aborted;

  /** Clears state and enters authentication after a definite session failure. */
  const sessionInvalid = (): void => {
    cancel();
    applications = undefined;
    recoveryRequired = false;
    options.setRecoveryRequired?.(false);
    publish({ kind: 'closed' });
    options.requestAuthentication();
  };

  /** Runs one confirmed application mutation under current capability ownership. */
  const mutate = async (
    confirm: () => Promise<boolean>,
    invoke: (
      operations: Partial<AdminApplicationOperations>,
    ) => Promise<AdminApplicationMutationResult>,
  ): Promise<void> => {
    if (disposed || operation || recoveryRequired) return;
    const initial = options.readState();
    if (initial.kind !== 'authenticated' || !initial.capabilities.canUpdateApplications) return;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    try {
      if (!(await confirm()) || !owns(capturedGeneration, controller)) return;
      const current = options.readState();
      const operations = options.readOperations();
      if (
        current.kind !== 'authenticated' ||
        !current.capabilities.canUpdateApplications ||
        !operations
      ) {
        return;
      }
      const result = await invoke(operations);
      if (!owns(capturedGeneration, controller)) return;
      operation = undefined;
      if (result.kind === 'session-invalid') {
        sessionInvalid();
      } else if (result.kind === 'outcome-unknown') {
        recoveryRequired = true;
        options.setRecoveryRequired?.(true);
        publish({ kind: 'indeterminate', ...(applications ? { previous: applications } : {}) });
      } else if (result.kind === 'success') {
        await load();
      } else if (result.kind === 'failure') {
        publish({
          kind: 'failure',
          failure: result.failure,
          ...(applications ? { previous: applications } : {}),
        });
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Loads the current complete catalog. */
  const load = async (): Promise<void> => {
    if (disposed || operation) return;
    const current = options.readState();
    const operations = options.readOperations();
    if (
      current.kind !== 'authenticated' ||
      !current.capabilities.canReadApplications ||
      !operations?.listAll
    ) {
      return;
    }
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    publish({ kind: 'loading', ...(applications ? { previous: applications } : {}) });
    try {
      const result = await operations.listAll();
      if (!owns(capturedGeneration, controller)) return;
      operation = undefined;
      if (!result) return;
      if (result.kind === 'session-invalid') {
        sessionInvalid();
      } else if (result.kind === 'success') {
        applications = result.value;
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish({ kind: 'list', scope: 'global', applications });
      } else {
        publish({
          kind: 'failure',
          failure: result.failure,
          ...(applications ? { previous: applications } : {}),
        });
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  return {
    syncContext(state, nextSessionEpoch) {
      if (disposed) return;
      const authenticated = state.kind === 'authenticated';
      if (!authenticated || (sessionEpoch >= 0 && sessionEpoch !== nextSessionEpoch)) {
        cancel();
        applications = undefined;
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish({ kind: 'closed' });
      }
      sessionEpoch = authenticated ? nextSessionEpoch : -1;
    },
    load,
    activate: (applicationId, confirm) =>
      mutate(confirm, (operations) => {
        if (!operations.activate) return Promise.resolve({ kind: 'cancelled' });
        return operations.activate(applicationId);
      }),
    cancelActiveOperation: cancel,
    handleRecoverableGeometry(recoverable) {
      if (!recoverable) cancel();
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      applications = undefined;
      recoveryRequired = false;
      options.setRecoveryRequired?.(false);
      options.publishState({ kind: 'closed' });
    },
  };
}
