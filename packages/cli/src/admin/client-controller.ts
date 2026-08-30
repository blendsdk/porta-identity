/** Operation and plaintext ownership for the selected-organization client workflow. */

import type { CreateClientInput } from '@portaidentity/sdk';
import type { AdminConnectionState } from './state.js';
import type { AdminClientCreateResult, AdminClientOperations } from './client-service.js';
import type {
  AdminClient,
  AdminClientMutationResult,
  AdminClientViewState,
  AdminGeneratedClientSecret,
} from './client-state.js';

/** Dependencies for one direct selected-organization client controller. */
export interface AdminClientControllerOptions {
  /** Reads the latest application-owned connection and capability state. */
  readonly readState: () => AdminConnectionState;
  /** Reads validated operations for the current verified session. */
  readonly readOperations: () => Partial<AdminClientOperations> | undefined;
  /** Publishes immutable metadata-only feature state. */
  readonly publishState: (state: AdminClientViewState) => void;
  /** Presents one one-time secret without retaining it in state. */
  readonly presentSecret?: (
    secret: AdminGeneratedClientSecret,
    signal: AbortSignal,
  ) => Promise<void>;
  /** Enters the existing authentication flow after final session invalidation. */
  readonly requestAuthentication: () => void;
  /** Gates later mutations until deliberate reload reconciles an unknown outcome. */
  readonly setRecoveryRequired?: (required: boolean) => void;
}

/** Selected-organization client workflow boundary. */
export interface AdminClientController {
  /** Applies the latest selected organization and verified-session epoch. */
  readonly syncContext: (state: AdminConnectionState, sessionEpoch: number) => void;
  /** Deliberately loads and reconciles the complete organization client catalog. */
  readonly load: () => Promise<void>;
  /** Confirms and activates one client at most once. */
  readonly activate: (clientId: string, confirm: () => Promise<boolean>) => Promise<void>;
  /** Confirms and deactivates one client at most once. */
  readonly deactivate: (clientId: string, confirm: () => Promise<boolean>) => Promise<void>;
  /** Creates one client and owns any returned plaintext until presentation closes. */
  readonly create: (input: Omit<CreateClientInput, 'organizationId'>) => Promise<void>;
  /** Cancels the current read, confirmation, mutation, or secret presentation. */
  readonly cancelActiveOperation: () => void;
  /** Cancels ownership when the terminal enters resize-only recovery. */
  readonly handleRecoverableGeometry: (recoverable: boolean) => void;
  /** Invalidates all work and closes the feature state. */
  readonly dispose: () => void;
}

/** Creates the small selected-organization client workflow controller. */
export function createAdminClientController(
  options: AdminClientControllerOptions,
): AdminClientController {
  let sessionEpoch = -1;
  let organizationId: string | undefined;
  let generation = 0;
  let operation: AbortController | undefined;
  let clients: readonly AdminClient[] | undefined;
  let recoveryRequired = false;
  let disposed = false;

  /** Publishes only while the controller still belongs to the application. */
  const publish = (state: AdminClientViewState): void => {
    if (!disposed) options.publishState(state);
  };

  /** Clears current asynchronous and plaintext ownership. */
  const cancel = (): void => {
    generation += 1;
    operation?.abort();
    operation = undefined;
  };

  /** Returns true only for the current organization/session continuation. */
  const owns = (
    capturedGeneration: number,
    capturedOrganization: string,
    controller: AbortController,
  ): boolean =>
    !disposed &&
    generation === capturedGeneration &&
    organizationId === capturedOrganization &&
    operation === controller &&
    !controller.signal.aborted;

  /** Clears state and enters authentication after a definite session failure. */
  const sessionInvalid = (): void => {
    cancel();
    clients = undefined;
    recoveryRequired = false;
    options.setRecoveryRequired?.(false);
    publish({ kind: 'closed' });
    options.requestAuthentication();
  };

  /** Deliberately loads the current selected organization's complete catalog. */
  const load = async (): Promise<void> => {
    if (disposed || operation || !organizationId) return;
    const current = options.readState();
    const operations = options.readOperations();
    if (
      current.kind !== 'authenticated' ||
      current.organization?.id !== organizationId ||
      !current.capabilities.canReadClients ||
      !operations?.listAll
    ) {
      return;
    }
    const capturedOrganization = organizationId;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    publish({
      kind: 'loading',
      organizationId: capturedOrganization,
      ...(clients ? { previous: clients } : {}),
    });
    try {
      const result = await operations.listAll(capturedOrganization);
      if (!owns(capturedGeneration, capturedOrganization, controller)) return;
      operation = undefined;
      if (!result) return;
      if (result.kind === 'session-invalid') {
        sessionInvalid();
      } else if (result.kind === 'success') {
        clients = result.value;
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish({ kind: 'list', organizationId: capturedOrganization, clients });
      } else {
        publish({
          kind: 'failure',
          organizationId: capturedOrganization,
          failure: result.failure,
          ...(clients ? { previous: clients } : {}),
        });
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Enters the fixed reconciliation-required state for an uncertain client mutation. */
  const requireReconciliation = (capturedOrganization: string): void => {
    recoveryRequired = true;
    options.setRecoveryRequired?.(true);
    publish({
      kind: 'indeterminate',
      organizationId: capturedOrganization,
      ...(clients ? { previous: clients } : {}),
    });
  };

  /** Continues after the presenter exclusively owns the transient secret value. */
  const finishSecretPresentation = async (
    presentation: Promise<void>,
    capturedOrganization: string,
    controller: AbortController,
  ): Promise<void> => {
    try {
      await presentation;
    } catch {
      if (owns(generation, capturedOrganization, controller)) {
        requireReconciliation(capturedOrganization);
        operation = undefined;
      }
      return;
    }
    if (!owns(generation, capturedOrganization, controller)) return;
    operation = undefined;
    await load();
  };

  /** Applies one fixed mutation result without retaining published plaintext. */
  const finishMutation = (
    result: AdminClientMutationResult | AdminClientMutationResult<AdminClientCreateResult>,
    capturedOrganization: string,
    controller: AbortController,
  ): Promise<void> => {
    if (result.kind === 'session-invalid') {
      sessionInvalid();
      return Promise.resolve();
    }
    if (result.kind === 'outcome-unknown') {
      requireReconciliation(capturedOrganization);
      operation = undefined;
      return Promise.resolve();
    }
    if (result.kind === 'failure') {
      publish({
        kind: 'failure',
        organizationId: capturedOrganization,
        failure: result.failure,
        ...(clients ? { previous: clients } : {}),
      });
      operation = undefined;
      return Promise.resolve();
    }
    if (result.kind !== 'success') {
      operation = undefined;
      return Promise.resolve();
    }
    if ('value' in result && result.value.secret) {
      if (!options.presentSecret) {
        requireReconciliation(capturedOrganization);
        operation = undefined;
        return Promise.resolve();
      }
      try {
        const presentation = options.presentSecret(result.value.secret, controller.signal);
        return finishSecretPresentation(presentation, capturedOrganization, controller);
      } catch {
        requireReconciliation(capturedOrganization);
        operation = undefined;
        return Promise.resolve();
      }
    }
    operation = undefined;
    return load();
  };

  /** Runs one confirmed lifecycle mutation with fresh capability/context checks. */
  const lifecycle = async (
    clientId: string,
    confirm: () => Promise<boolean>,
    method: 'activate' | 'deactivate',
  ): Promise<void> => {
    if (disposed || operation || recoveryRequired || !organizationId) return;
    const initial = options.readState();
    if (
      initial.kind !== 'authenticated' ||
      initial.organization?.id !== organizationId ||
      !initial.capabilities.canUpdateClients
    ) {
      return;
    }
    const capturedOrganization = organizationId;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    try {
      if (!(await confirm()) || !owns(capturedGeneration, capturedOrganization, controller)) return;
      const current = options.readState();
      const operations = options.readOperations();
      if (
        current.kind !== 'authenticated' ||
        current.organization?.id !== capturedOrganization ||
        !current.capabilities.canUpdateClients ||
        !operations?.[method]
      ) {
        return;
      }
      const result = await operations[method](capturedOrganization, clientId, controller.signal);
      if (!owns(capturedGeneration, capturedOrganization, controller)) return;
      await finishMutation(result, capturedOrganization, controller);
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Creates one client under current organization and plaintext ownership. */
  const create = async (input: Omit<CreateClientInput, 'organizationId'>): Promise<void> => {
    if (disposed || operation || recoveryRequired || !organizationId) return;
    const current = options.readState();
    const operations = options.readOperations();
    if (
      current.kind !== 'authenticated' ||
      current.organization?.id !== organizationId ||
      !current.capabilities.canCreateClients ||
      !operations?.create
    ) {
      return;
    }
    const capturedOrganization = organizationId;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    const result = await operations.create(capturedOrganization, input);
    if (!owns(capturedGeneration, capturedOrganization, controller)) return;
    return finishMutation(result, capturedOrganization, controller);
  };

  return {
    syncContext(state, nextSessionEpoch) {
      if (disposed) return;
      const nextOrganization = state.kind === 'authenticated' ? state.organization?.id : undefined;
      const contextChanged =
        state.kind !== 'authenticated' ||
        (sessionEpoch >= 0 && sessionEpoch !== nextSessionEpoch) ||
        organizationId !== nextOrganization;
      if (contextChanged) {
        cancel();
        clients = undefined;
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish({ kind: 'closed' });
      }
      sessionEpoch = state.kind === 'authenticated' ? nextSessionEpoch : -1;
      organizationId = nextOrganization;
    },
    load,
    activate: (clientId, confirm) => lifecycle(clientId, confirm, 'activate'),
    deactivate: (clientId, confirm) => lifecycle(clientId, confirm, 'deactivate'),
    create,
    cancelActiveOperation: cancel,
    handleRecoverableGeometry(recoverable) {
      if (!recoverable) cancel();
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      clients = undefined;
      recoveryRequired = false;
      options.setRecoveryRequired?.(false);
      options.publishState({ kind: 'closed' });
    },
  };
}
