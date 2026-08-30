/** Operation ownership for the deployment-global application workflow. */

import type {
  CreateApplicationInput,
  CreateModuleInput,
  UpdateApplicationInput,
  UpdateModuleInput,
} from '@portaidentity/sdk';

import type { AdminConnectionState } from './state.js';
import type { AdminApplicationOperations } from './application-service.js';
import type {
  AdminApplicationMutationResult,
  AdminApplicationProjection,
  AdminApplicationViewState,
} from './application-state.js';

/** Dependencies for one direct global application controller. */
export interface AdminApplicationControllerOptions {
  /** Reads the latest application-owned connection and capability state. */
  readonly readState: () => AdminConnectionState;
  /** Reads validated operations for the current verified session. */
  readonly readOperations: () => Partial<AdminApplicationOperations> | undefined;
  /** Publishes immutable feature state to the workspace boundary. */
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
  /** Loads one application and its complete same-parent module collection. */
  readonly select: (applicationId: string) => Promise<void>;
  /** Reconciles the retained list or selected detail through its authoritative read path. */
  readonly reload: () => Promise<void>;
  /** Creates one application and reloads the authoritative catalog. */
  readonly create: (input: CreateApplicationInput) => Promise<void>;
  /** Updates mutable fields and reloads authoritative detail. */
  readonly update: (
    applicationId: string,
    input: UpdateApplicationInput,
    etag?: string,
  ) => Promise<void>;
  /** Confirms and activates one application at most once. */
  readonly activate: (
    applicationId: string,
    confirm: (signal: AbortSignal) => Promise<boolean>,
  ) => Promise<void>;
  /** Confirms and deactivates one application at most once. */
  readonly deactivate: (
    applicationId: string,
    confirm: (signal: AbortSignal) => Promise<boolean>,
  ) => Promise<void>;
  /** Confirms and permanently archives one application at most once. */
  readonly archive: (
    applicationId: string,
    confirm: (signal: AbortSignal) => Promise<boolean>,
  ) => Promise<void>;
  /** Adds a module and reloads authoritative same-parent detail. */
  readonly addModule: (applicationId: string, input: CreateModuleInput) => Promise<void>;
  /** Updates a module and reloads authoritative same-parent detail. */
  readonly updateModule: (
    applicationId: string,
    moduleId: string,
    input: UpdateModuleInput,
  ) => Promise<void>;
  /** Confirms module deactivation and reloads authoritative same-parent detail. */
  readonly deactivateModule: (
    applicationId: string,
    moduleId: string,
    confirm: (signal: AbortSignal) => Promise<boolean>,
  ) => Promise<void>;
  /** Cancels the current read, confirmation, or mutation. */
  readonly cancelActiveOperation: () => void;
  /** Cancels ownership when the terminal enters resize-only recovery. */
  readonly handleRecoverableGeometry: (recoverable: boolean) => void;
  /** Invalidates all work and closes the feature state. */
  readonly dispose: () => void;
}

/** Application capability names used by the controller's fresh dispatch checks. */
type ApplicationCapability =
  | 'canCreateApplications'
  | 'canUpdateApplications'
  | 'canArchiveApplications';

/** Creates the small global application workflow controller. */
export function createAdminApplicationController(
  options: AdminApplicationControllerOptions,
): AdminApplicationController {
  let sessionEpoch = -1;
  let generation = 0;
  let operation: AbortController | undefined;
  let mutationDispatched = false;
  let projection: AdminApplicationProjection | undefined;
  let recoveryRequired = false;
  let disposed = false;

  /** Publishes only while the controller still belongs to the application. */
  const publish = (state: AdminApplicationViewState): void => {
    if (!disposed) options.publishState(state);
  };

  /** Clears asynchronous ownership and records uncertainty only after a mutation was dispatched. */
  const cancel = (reconcileDispatchedMutation = false): void => {
    const uncertain = reconcileDispatchedMutation && mutationDispatched;
    generation += 1;
    operation?.abort();
    operation = undefined;
    mutationDispatched = false;
    if (uncertain) {
      recoveryRequired = true;
      options.setRecoveryRequired?.(true);
      publish({ kind: 'indeterminate', ...(projection ? { previous: projection } : {}) });
    }
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
    projection = undefined;
    recoveryRequired = false;
    options.setRecoveryRequired?.(false);
    publish({ kind: 'closed' });
    options.requestAuthentication();
  };

  /** Publishes a safe fixed mutation failure while preserving validated content. */
  const publishFailure = (
    result: Extract<AdminApplicationMutationResult, { kind: 'failure' }>,
  ): void => {
    publish({
      kind: 'failure',
      failure: result.failure,
      ...(projection ? { previous: projection } : {}),
    });
  };

  /** Handles one completed mutation and returns whether authoritative reload may continue. */
  const finishMutation = (result: AdminApplicationMutationResult): boolean => {
    mutationDispatched = false;
    if (result.kind === 'session-invalid') {
      sessionInvalid();
      return false;
    }
    if (result.kind === 'outcome-unknown') {
      recoveryRequired = true;
      options.setRecoveryRequired?.(true);
      publish({ kind: 'indeterminate', ...(projection ? { previous: projection } : {}) });
      return false;
    }
    if (result.kind === 'failure') {
      publishFailure(result);
      return false;
    }
    return result.kind === 'success';
  };

  /** Loads one selected application's metadata and complete same-parent module catalog. */
  const select = async (applicationId: string): Promise<void> => {
    if (disposed || operation) return;
    const current = options.readState();
    const operations = options.readOperations();
    if (
      current.kind !== 'authenticated' ||
      !current.capabilities.canReadApplications ||
      !operations?.get ||
      !operations.listModules
    ) {
      return;
    }
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    publish({ kind: 'loading', ...(projection ? { previous: projection } : {}) });
    try {
      const applicationResult = await operations.get(applicationId);
      if (!owns(capturedGeneration, controller) || !applicationResult) return;
      if (applicationResult.kind === 'session-invalid') {
        sessionInvalid();
        return;
      }
      if (applicationResult.kind === 'failure') {
        publish({
          kind: 'failure',
          failure: applicationResult.failure,
          ...(projection ? { previous: projection } : {}),
        });
        return;
      }
      const moduleResult = await operations.listModules(applicationResult.value.application.id);
      if (!owns(capturedGeneration, controller) || !moduleResult) return;
      if (moduleResult.kind === 'session-invalid') {
        sessionInvalid();
      } else if (moduleResult.kind === 'failure') {
        publish({
          kind: 'failure',
          failure: moduleResult.failure,
          ...(projection ? { previous: projection } : {}),
        });
      } else {
        projection = {
          kind: 'detail',
          scope: 'global',
          applications: projection?.applications ?? [applicationResult.value.application],
          application: applicationResult.value.application,
          etag: applicationResult.value.etag,
          modules: moduleResult.value,
        };
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish(projection);
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
    publish({ kind: 'loading', ...(projection ? { previous: projection } : {}) });
    try {
      const result = await operations.listAll();
      if (!owns(capturedGeneration, controller) || !result) return;
      if (result.kind === 'session-invalid') {
        sessionInvalid();
      } else if (result.kind === 'success') {
        projection = { kind: 'list', scope: 'global', applications: result.value };
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish(projection);
      } else {
        publish({
          kind: 'failure',
          failure: result.failure,
          ...(projection ? { previous: projection } : {}),
        });
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Reloads whichever safe projection the operator currently owns. */
  const reload = (): Promise<void> =>
    projection?.kind === 'detail' ? select(projection.application.id) : load();

  /** Checks that a module mutation still targets the selected non-archived parent. */
  const ownsMutableModuleParent = (applicationId: string, moduleId?: string): boolean =>
    projection?.kind === 'detail' &&
    projection.application.id === applicationId &&
    projection.application.status !== 'archived' &&
    (moduleId === undefined ||
      projection.modules.some(
        (module) => module.id === moduleId && module.applicationId === applicationId,
      ));

  /** Runs one application mutation with fresh capability and single-operation ownership. */
  const mutate = async (
    capability: ApplicationCapability,
    invoke: (operations: Partial<AdminApplicationOperations>) => Promise<AdminApplicationMutationResult>,
    reload: 'list' | { readonly applicationId: string },
    confirm?: (signal: AbortSignal) => Promise<boolean>,
    precondition?: () => boolean,
  ): Promise<void> => {
    if (disposed || operation || recoveryRequired) return;
    const initial = options.readState();
    if (
      initial.kind !== 'authenticated' ||
      !initial.capabilities[capability] ||
      (precondition && !precondition())
    ) {
      return;
    }
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    try {
      if (confirm && (!(await confirm(controller.signal)) || !owns(capturedGeneration, controller))) {
        return;
      }
      const current = options.readState();
      const operations = options.readOperations();
      if (
        current.kind !== 'authenticated' ||
        !current.capabilities[capability] ||
        !operations ||
        (precondition && !precondition())
      ) {
        return;
      }
      mutationDispatched = true;
      const result = await invoke(operations);
      if (!owns(capturedGeneration, controller)) return;
      if (!finishMutation(result)) return;
      operation = undefined;
      if (reload === 'list') await load();
      else await select(reload.applicationId);
    } finally {
      if (operation === controller) {
        operation = undefined;
        mutationDispatched = false;
      }
    }
  };

  return {
    syncContext(state, nextSessionEpoch) {
      if (disposed) return;
      const authenticated = state.kind === 'authenticated';
      if (!authenticated || (sessionEpoch >= 0 && sessionEpoch !== nextSessionEpoch)) {
        cancel();
        projection = undefined;
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish({ kind: 'closed' });
      }
      sessionEpoch = authenticated ? nextSessionEpoch : -1;
    },
    load,
    select,
    reload,
    create: (input) =>
      mutate(
        'canCreateApplications',
        (operations) =>
          operations.create?.(input) ?? Promise.resolve({ kind: 'cancelled' }),
        'list',
      ),
    update: (applicationId, input, etag) =>
      mutate(
        'canUpdateApplications',
        (operations) =>
          operations.update?.(applicationId, input, etag) ??
          Promise.resolve({ kind: 'cancelled' }),
        { applicationId },
      ),
    activate: (applicationId, confirm) =>
      mutate(
        'canUpdateApplications',
        (operations) =>
          operations.activate?.(applicationId) ?? Promise.resolve({ kind: 'cancelled' }),
        { applicationId },
        confirm,
      ),
    deactivate: (applicationId, confirm) =>
      mutate(
        'canUpdateApplications',
        (operations) =>
          operations.deactivate?.(applicationId) ?? Promise.resolve({ kind: 'cancelled' }),
        { applicationId },
        confirm,
      ),
    archive: (applicationId, confirm) =>
      mutate(
        'canArchiveApplications',
        (operations) =>
          operations.archive?.(applicationId) ?? Promise.resolve({ kind: 'cancelled' }),
        { applicationId },
        confirm,
      ),
    addModule: (applicationId, input) =>
      mutate(
        'canUpdateApplications',
        (operations) =>
          operations.addModule?.(applicationId, input) ?? Promise.resolve({ kind: 'cancelled' }),
        { applicationId },
        undefined,
        () => ownsMutableModuleParent(applicationId),
      ),
    updateModule: (applicationId, moduleId, input) =>
      mutate(
        'canUpdateApplications',
        (operations) =>
          operations.updateModule?.(applicationId, moduleId, input) ??
          Promise.resolve({ kind: 'cancelled' }),
        { applicationId },
        undefined,
        () => ownsMutableModuleParent(applicationId, moduleId),
      ),
    deactivateModule: (applicationId, moduleId, confirm) =>
      mutate(
        'canUpdateApplications',
        (operations) =>
          operations.deactivateModule?.(applicationId, moduleId) ??
          Promise.resolve({ kind: 'cancelled' }),
        { applicationId },
        confirm,
        () => ownsMutableModuleParent(applicationId, moduleId),
      ),
    cancelActiveOperation: () => cancel(true),
    handleRecoverableGeometry(recoverable) {
      if (!recoverable) cancel(true);
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      projection = undefined;
      recoveryRequired = false;
      options.setRecoveryRequired?.(false);
      options.publishState({ kind: 'closed' });
    },
  };
}
