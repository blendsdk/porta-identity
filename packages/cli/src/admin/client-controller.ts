/** Operation, context, and plaintext ownership for selected-organization clients. */

import type { CreateClientInput, GenerateSecretInput, UpdateClientInput } from '@portaidentity/sdk';
import type { AdminClientCreateResult, AdminClientOperations } from './client-service.js';
import type {
  AdminClient,
  AdminClientMutationResult,
  AdminClientProjection,
  AdminClientSecretPresentation,
  AdminClientViewState,
  AdminGeneratedClientSecret,
} from './client-state.js';
import type { AdminConnectionState } from './state.js';

/** Dependencies for one direct selected-organization client controller. */
export interface AdminClientControllerOptions {
  /** Reads the latest application-owned connection and capability state. */
  readonly readState: () => AdminConnectionState;
  /** Reads validated operations for the current verified session. */
  readonly readOperations: () => Partial<AdminClientOperations> | undefined;
  /** Publishes immutable metadata-only feature state. */
  readonly publishState: (state: AdminClientViewState) => void;
  /** Resolves a safe application name when application read is available. */
  readonly resolveApplicationName?: (applicationId: string) => string | undefined;
  /** Presents one one-time secret without retaining it in state. */
  readonly presentSecret?: (secret: AdminClientSecretPresentation, signal: AbortSignal) => Promise<void>;
  /** Enters the existing authentication flow after final session invalidation. */
  readonly requestAuthentication: () => void;
  /** Gates later mutations until deliberate reload reconciles an unknown outcome. */
  readonly setRecoveryRequired?: (required: boolean) => void;
}

/** Selected-organization client workflow boundary. */
export interface AdminClientController {
  /** Applies the latest selected organization and verified-session epoch. */
  readonly syncContext: (state: AdminConnectionState, sessionEpoch: number) => void;
  /** Loads the complete organization client catalog. */
  readonly load: () => Promise<void>;
  /** Loads one same-organization client detail. */
  readonly select: (clientId: string) => Promise<void>;
  /** Reloads the retained list, detail, or secret projection. */
  readonly reload: () => Promise<void>;
  /** Creates one client and owns any returned plaintext until presentation closes. */
  readonly create: (input: Omit<CreateClientInput, 'organizationId'>) => Promise<void>;
  /** Updates mutable client configuration. */
  readonly update: (clientId: string, input: UpdateClientInput, etag?: string) => Promise<void>;
  /** Confirms and activates one client at most once. */
  readonly activate: (clientId: string, confirm: (signal: AbortSignal) => Promise<boolean>) => Promise<void>;
  /** Confirms and deactivates one client at most once. */
  readonly deactivate: (clientId: string, confirm: (signal: AbortSignal) => Promise<boolean>) => Promise<void>;
  /** Confirms and permanently revokes one client at most once. */
  readonly revoke: (clientId: string, confirm: (signal: AbortSignal) => Promise<boolean>) => Promise<void>;
  /** Loads metadata-only secrets for one selected confidential client. */
  readonly loadSecrets: (clientId: string) => Promise<void>;
  /** Generates and presents one modern client secret exactly once. */
  readonly generateSecret: (clientId: string, input?: GenerateSecretInput) => Promise<void>;
  /** Confirms and permanently revokes one same-parent secret. */
  readonly revokeSecret: (
    clientId: string,
    secretId: string,
    confirm: (signal: AbortSignal) => Promise<boolean>,
  ) => Promise<void>;
  /** Cancels the current read, confirmation, mutation, or secret presentation. */
  readonly cancelActiveOperation: () => void;
  /** Cancels ownership when the terminal enters resize-only recovery. */
  readonly handleRecoverableGeometry: (recoverable: boolean) => void;
  /** Invalidates all work and closes the feature state. */
  readonly dispose: () => void;
}

/** Client capabilities checked again immediately before mutation dispatch. */
type ClientCapability = 'canCreateClients' | 'canUpdateClients' | 'canRevokeClients';

/** Mutation values that may carry one transient plaintext secret. */
type ClientMutationValue = AdminClientCreateResult | AdminGeneratedClientSecret;

/** Creates the feature-specific selected-organization client controller. */
export function createAdminClientController(options: AdminClientControllerOptions): AdminClientController {
  let sessionEpoch = -1;
  let organizationId: string | undefined;
  let generation = 0;
  let operation: AbortController | undefined;
  let mutationDispatched = false;
  let projection: AdminClientProjection | undefined;
  let recoveryRequired = false;
  let disposed = false;

  /** Publishes only while this controller still belongs to the application. */
  const publish = (state: AdminClientViewState): void => {
    if (!disposed) options.publishState(state);
  };

  /** Keeps the earlier list-only retained-state shape compatible with existing callers. */
  const previous = (): AdminClientProjection | readonly AdminClient[] | undefined =>
    projection?.kind === 'list' ? projection.clients : projection;

  /** Publishes the fixed reconciliation state without retaining plaintext. */
  const requireReconciliation = (owner: string): void => {
    recoveryRequired = true;
    options.setRecoveryRequired?.(true);
    const retained = previous();
    publish({ kind: 'indeterminate', organizationId: owner, ...(retained ? { previous: retained } : {}) });
  };

  /** Clears ownership and records uncertainty only after a mutation was dispatched. */
  const cancel = (reconcileDispatchedMutation = false): void => {
    const uncertainOwner = reconcileDispatchedMutation && mutationDispatched ? organizationId : undefined;
    generation += 1;
    operation?.abort();
    operation = undefined;
    mutationDispatched = false;
    if (uncertainOwner) requireReconciliation(uncertainOwner);
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
    projection = undefined;
    recoveryRequired = false;
    options.setRecoveryRequired?.(false);
    publish({ kind: 'closed' });
    options.requestAuthentication();
  };

  /** Publishes one fixed safe failure while preserving validated content. */
  const publishFailure = (
    owner: string,
    result: Extract<AdminClientMutationResult, { kind: 'failure' }>,
  ): void => {
    const retained = previous();
    publish({
      kind: 'failure',
      organizationId: owner,
      failure: result.failure,
      ...(retained ? { previous: retained } : {}),
    });
  };

  /** Loads the complete catalog for the current selected organization. */
  const load = async (): Promise<void> => {
    if (disposed || operation || !organizationId) return;
    const current = options.readState();
    const operations = options.readOperations();
    if (
      current.kind !== 'authenticated' ||
      current.organization?.id !== organizationId ||
      !current.capabilities.canReadClients ||
      !operations?.listAll
    ) return;
    const owner = organizationId;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    const retained = previous();
    publish({ kind: 'loading', organizationId: owner, ...(retained ? { previous: retained } : {}) });
    try {
      const result = await operations.listAll(owner);
      if (!owns(capturedGeneration, owner, controller) || !result) return;
      if (result.kind === 'session-invalid') {
        sessionInvalid();
      } else if (result.kind === 'success') {
        projection = { kind: 'list', organizationId: owner, clients: result.value };
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish(projection);
      } else {
        publish({ kind: 'failure', organizationId: owner, failure: result.failure, ...(retained ? { previous: retained } : {}) });
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Loads one client while preserving its complete parent catalog. */
  const select = async (clientId: string): Promise<void> => {
    if (disposed || operation || !organizationId) return;
    const current = options.readState();
    const operations = options.readOperations();
    if (
      current.kind !== 'authenticated' ||
      current.organization?.id !== organizationId ||
      !current.capabilities.canReadClients ||
      !operations?.get
    ) return;
    const owner = organizationId;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    const retained = previous();
    publish({ kind: 'loading', organizationId: owner, ...(retained ? { previous: retained } : {}) });
    try {
      const result = await operations.get(owner, clientId);
      if (!owns(capturedGeneration, owner, controller) || !result) return;
      if (result.kind === 'session-invalid') {
        sessionInvalid();
      } else if (result.kind === 'failure') {
        publish({ kind: 'failure', organizationId: owner, failure: result.failure, ...(retained ? { previous: retained } : {}) });
      } else {
        projection = {
          kind: 'detail',
          organizationId: owner,
          clients: projection?.clients ?? [result.value.client],
          client: result.value.client,
          applicationName: current.capabilities.canReadApplications
            ? options.resolveApplicationName?.(result.value.client.applicationId)
            : undefined,
          etag: result.value.etag,
          secrets: [],
        };
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish(projection);
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Loads metadata only for the currently selected confidential client. */
  const loadSecrets = async (clientId: string): Promise<void> => {
    if (
      disposed || operation || !organizationId || !projection || projection.kind === 'list' ||
      projection.client.id !== clientId || projection.client.clientType !== 'confidential' ||
      projection.client.status === 'revoked'
    ) return;
    const current = options.readState();
    const operations = options.readOperations();
    if (
      current.kind !== 'authenticated' || current.organization?.id !== organizationId ||
      !current.capabilities.canReadClients || !operations?.listSecrets
    ) return;
    const owner = organizationId;
    const retained = projection;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    publish({ kind: 'loading', organizationId: owner, previous: retained });
    try {
      const result = await operations.listSecrets(owner, clientId);
      if (!owns(capturedGeneration, owner, controller) || !result) return;
      if (result.kind === 'session-invalid') {
        sessionInvalid();
      } else if (result.kind === 'failure') {
        publish({ kind: 'failure', organizationId: owner, failure: result.failure, previous: retained });
      } else {
        projection = {
          kind: 'secrets',
          organizationId: owner,
          clients: retained.clients,
          client: retained.client,
          applicationName: retained.applicationName,
          etag: retained.etag,
          secrets: result.value,
        };
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish(projection);
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Reloads whichever validated projection is currently retained. */
  const reload = (): Promise<void> => {
    if (projection?.kind === 'secrets') return loadSecrets(projection.client.id);
    if (projection?.kind === 'detail') return select(projection.client.id);
    return load();
  };

  /** Checks the exact retained parent and operation eligibility before dispatch. */
  const ownsMutableTarget = (
    clientId: string,
    mode: 'lifecycle' | 'update' | 'generate' | 'revoke-secret',
    secretId?: string,
  ): boolean => {
    // Earlier direct lifecycle callers are retained; the service and server still recheck ownership
    // and lifecycle state. New configuration and secret paths fail closed until detail is loaded.
    if (!projection) return mode === 'lifecycle';
    const client = projection.clients.find((candidate) => candidate.id === clientId);
    if (!client || client.status === 'revoked') return false;
    if (mode === 'lifecycle') return true;
    if (projection.kind === 'list' || projection.client.id !== clientId) return false;
    if (mode === 'update') return true;
    if (client.clientType !== 'confidential') return false;
    if (mode === 'generate') return true;
    return projection.kind === 'secrets' && secretId !== undefined &&
      projection.secrets.some((secret) =>
        secret.id === secretId && secret.clientId === clientId && secret.status === 'active');
  };

  /** Requires active organization context and application-read capability for client creation. */
  const canCreateInContext = (): boolean => {
    const current = options.readState();
    return current.kind === 'authenticated' && current.organization?.id === organizationId &&
      current.organization?.status === 'active' && current.capabilities.canReadApplications;
  };

  /** Finishes one plaintext presentation and then performs its authoritative read. */
  const finishPresentation = async (
    presentation: Promise<void>,
    owner: string,
    controller: AbortController,
    reloadAfter: () => Promise<void>,
  ): Promise<void> => {
    try {
      await presentation;
    } catch {
      if (owns(generation, owner, controller)) {
        operation = undefined;
        requireReconciliation(owner);
        mutationDispatched = false;
      }
      return;
    }
    if (!owns(generation, owner, controller)) return;
    operation = undefined;
    await reloadAfter();
    mutationDispatched = false;
  };

  /** Enriches a returned secret with authoritative display identity before handoff. */
  const presentationValue = (value: ClientMutationValue): AdminClientSecretPresentation | undefined => {
    if ('client' in value) {
      if (!value.secret) return undefined;
      return {
        ...value.secret,
        clientName: value.client.clientName,
        oidcClientId: value.client.clientId,
      };
    }
    const retained = projection;
    if (!retained || retained.kind === 'list' || retained.client.id !== value.clientId) return undefined;
    return {
      ...value,
      clientName: retained.client.clientName,
      oidcClientId: retained.client.clientId,
    };
  };

  /** Reloads after a known mutation while retaining cancellation reconciliation ownership. */
  const finishReload = async (reloadAfter: () => Promise<void>): Promise<void> => {
    await reloadAfter();
    mutationDispatched = false;
  };

  /** Applies one mutation result and synchronously hands transient plaintext to its presenter. */
  const finishMutation = (
    result: AdminClientMutationResult | AdminClientMutationResult<ClientMutationValue>,
    owner: string,
    controller: AbortController,
    reloadAfter: () => Promise<void>,
  ): Promise<void> => {
    if (result.kind === 'session-invalid') {
      sessionInvalid();
      return Promise.resolve();
    }
    if (result.kind === 'outcome-unknown') {
      operation = undefined;
      requireReconciliation(owner);
      mutationDispatched = false;
      return Promise.resolve();
    }
    if (result.kind === 'failure') {
      operation = undefined;
      publishFailure(owner, result);
      mutationDispatched = false;
      return Promise.resolve();
    }
    if (result.kind !== 'success') {
      mutationDispatched = false;
      return Promise.resolve();
    }
    const value = 'value' in result ? result.value : undefined;
    const secret = value ? presentationValue(value) : undefined;
    if (value && (('plaintext' in value) || ('secret' in value && value.secret)) && !secret) {
      operation = undefined;
      requireReconciliation(owner);
      mutationDispatched = false;
      return Promise.resolve();
    }
    if (secret) {
      if (!options.presentSecret) {
        operation = undefined;
        requireReconciliation(owner);
        mutationDispatched = false;
        return Promise.resolve();
      }
      try {
        return finishPresentation(options.presentSecret(secret, controller.signal), owner, controller, reloadAfter);
      } catch {
        operation = undefined;
        requireReconciliation(owner);
        mutationDispatched = false;
        return Promise.resolve();
      }
    }
    operation = undefined;
    return finishReload(reloadAfter);
  };

  /** Runs one client or secret mutation with fresh context and capability checks. */
  const mutate = async (
    capability: ClientCapability,
    invoke: (
      operations: Partial<AdminClientOperations>,
      signal: AbortSignal,
      owner: string,
    ) => Promise<AdminClientMutationResult | AdminClientMutationResult<ClientMutationValue>>,
    reloadAfter: () => Promise<void>,
    confirm?: (signal: AbortSignal) => Promise<boolean>,
    precondition?: () => boolean,
  ): Promise<void> => {
    if (disposed || operation || recoveryRequired || !organizationId) return;
    const initial = options.readState();
    if (
      initial.kind !== 'authenticated' || initial.organization?.id !== organizationId ||
      !initial.capabilities[capability] || (precondition && !precondition())
    ) return;
    const owner = organizationId;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    let handedOff = false;
    try {
      if (confirm && (!(await confirm(controller.signal)) || !owns(capturedGeneration, owner, controller))) return;
      const current = options.readState();
      const operations = options.readOperations();
      if (
        current.kind !== 'authenticated' || current.organization?.id !== owner ||
        !current.capabilities[capability] || !operations || (precondition && !precondition())
      ) return;
      mutationDispatched = true;
      const result = await invoke(operations, controller.signal, owner);
      if (!owns(capturedGeneration, owner, controller)) return;
      const completion = finishMutation(result, owner, controller, reloadAfter);
      handedOff = true;
      return completion;
    } finally {
      if (!handedOff && operation === controller) {
        operation = undefined;
        mutationDispatched = false;
      }
    }
  };

  return {
    syncContext(state, nextSessionEpoch) {
      if (disposed) return;
      const nextOrganization = state.kind === 'authenticated' ? state.organization?.id : undefined;
      const changed = state.kind !== 'authenticated' ||
        (sessionEpoch >= 0 && sessionEpoch !== nextSessionEpoch) || organizationId !== nextOrganization;
      if (changed) {
        cancel();
        projection = undefined;
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish({ kind: 'closed' });
      }
      sessionEpoch = state.kind === 'authenticated' ? nextSessionEpoch : -1;
      organizationId = nextOrganization;
    },
    load,
    select,
    reload,
    create: (input) => mutate(
      'canCreateClients',
      (operations, _signal, owner) => operations.create?.(owner, input) ?? Promise.resolve({ kind: 'cancelled' }),
      load, undefined, canCreateInContext,
    ),
    update: (clientId, input, etag) => mutate(
      'canUpdateClients',
      (operations, signal, owner) => operations.update?.(owner, clientId, input, etag, signal) ?? Promise.resolve({ kind: 'cancelled' }),
      () => select(clientId), undefined, () => ownsMutableTarget(clientId, 'update'),
    ),
    activate: (clientId, confirm) => mutate(
      'canUpdateClients',
      (operations, signal, owner) => operations.activate?.(owner, clientId, signal) ?? Promise.resolve({ kind: 'cancelled' }),
      () => select(clientId), confirm, () => ownsMutableTarget(clientId, 'lifecycle'),
    ),
    deactivate: (clientId, confirm) => mutate(
      'canUpdateClients',
      (operations, signal, owner) => operations.deactivate?.(owner, clientId, signal) ?? Promise.resolve({ kind: 'cancelled' }),
      () => select(clientId), confirm, () => ownsMutableTarget(clientId, 'lifecycle'),
    ),
    revoke: (clientId, confirm) => mutate(
      'canRevokeClients',
      (operations, signal, owner) => operations.revoke?.(owner, clientId, signal) ?? Promise.resolve({ kind: 'cancelled' }),
      load, confirm, () => ownsMutableTarget(clientId, 'lifecycle'),
    ),
    loadSecrets,
    generateSecret: (clientId, input) => mutate(
      'canUpdateClients',
      (operations, signal, owner) => operations.generateSecret?.(owner, clientId, input, signal) ?? Promise.resolve({ kind: 'cancelled' }),
      () => loadSecrets(clientId), undefined, () => ownsMutableTarget(clientId, 'generate'),
    ),
    revokeSecret: (clientId, secretId, confirm) => mutate(
      'canRevokeClients',
      (operations, signal, owner) => operations.revokeSecret?.(owner, clientId, secretId, signal) ?? Promise.resolve({ kind: 'cancelled' }),
      () => loadSecrets(clientId), confirm, () => ownsMutableTarget(clientId, 'revoke-secret', secretId),
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
