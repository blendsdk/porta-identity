/** Operation and context ownership for Application role and permission administration. */

import type {
  CreatePermissionInput,
  CreateRoleInput,
  UpdatePermissionInput,
  UpdateRoleInput,
} from '@portaidentity/sdk';

import type { AdminRbacOperations } from './rbac-service.js';
import type {
  AdminApplicationRbacProjection,
  AdminApplicationRbacViewState,
  AdminRbacFailureKind,
  AdminRbacMutationResult,
  AdminRbacReductionResult,
} from './rbac-state.js';

/** Immutable owner used to reject results from an old Application or verified session. */
export interface AdminApplicationRbacContext {
  /** Application that owns every operation. */
  readonly applicationId: string;
  /** Epoch advanced whenever the verified session is replaced. */
  readonly sessionEpoch: number;
}

/** Dependencies for one Application-owned RBAC controller. */
export interface AdminApplicationRbacControllerOptions {
  /** Reads the latest selected Application and verified-session owner. */
  readonly readContext: () => AdminApplicationRbacContext;
  /** Reads validated operations from the current authenticated session. */
  readonly readOperations: () => Partial<AdminRbacOperations> | undefined;
  /** Publishes immutable validated state to the two RBAC pages. */
  readonly publishState: (state: AdminApplicationRbacViewState) => void;
  /** Enters the existing authentication flow after a definite session transition. */
  readonly requestAuthentication: () => void;
  /** Gates sibling mutations while an unknown outcome awaits explicit Reload. */
  readonly setRecoveryRequired?: (required: boolean) => void;
}

/** Direct Application role, permission, and mapping workflow boundary. */
export interface AdminApplicationRbacController {
  /** Loads the complete role and permission collections. */
  readonly load: () => Promise<void>;
  /** Performs the explicit read-only reconciliation after a failed or unknown operation. */
  readonly reload: () => Promise<void>;
  /** Creates one role and reloads authoritative state. */
  readonly createRole: (input: CreateRoleInput) => Promise<void>;
  /** Updates one role and reloads authoritative state. */
  readonly updateRole: (roleId: string, input: UpdateRoleInput) => Promise<void>;
  /** Permanently deletes one role and reloads authoritative state. */
  readonly deleteRole: (roleId: string) => Promise<void>;
  /** Creates one permission and reloads authoritative state. */
  readonly createPermission: (input: CreatePermissionInput) => Promise<void>;
  /** Updates mutable permission metadata and reloads authoritative state. */
  readonly updatePermission: (permissionId: string, input: UpdatePermissionInput) => Promise<void>;
  /** Permanently deletes one permission and reloads authoritative state. */
  readonly deletePermission: (permissionId: string) => Promise<void>;
  /** Loads assigned and available permissions for one retained role. */
  readonly loadRolePermissions: (roleId: string) => Promise<void>;
  /** Assigns one permission to one role and reloads both mapping collections. */
  readonly assignPermission: (roleId: string, permissionId: string) => Promise<void>;
  /** Removes one permission from one role and reloads both mapping collections. */
  readonly removePermission: (roleId: string, permissionId: string) => Promise<void>;
  /** Cancels owned work and requires reconciliation if a mutation was already dispatched. */
  readonly cancelActiveOperation: () => void;
  /** Releases the controller and clears protected state. */
  readonly dispose: () => void;
}

/** Creates the focused Application RBAC workflow controller. */
export function createAdminApplicationRbacController(
  options: AdminApplicationRbacControllerOptions,
): AdminApplicationRbacController {
  let generation = 0;
  let operation: AbortController | undefined;
  let mutationDispatched = false;
  let projection: AdminApplicationRbacProjection | undefined;
  let recoveryRequired = false;
  let disposed = false;

  /** Publishes only while this controller still owns its Application surface. */
  const publish = (state: AdminApplicationRbacViewState): void => {
    if (!disposed) options.publishState(state);
  };

  /** Confirms that one continuation still belongs to its exact Application and session epoch. */
  const owns = (
    capturedGeneration: number,
    context: AdminApplicationRbacContext,
    controller: AbortController,
  ): boolean => {
    const current = options.readContext();
    return (
      !disposed &&
      generation === capturedGeneration &&
      operation === controller &&
      !controller.signal.aborted &&
      current.applicationId === context.applicationId &&
      current.sessionEpoch === context.sessionEpoch
    );
  };

  /** Publishes a fixed failure while preserving the last validated collection. */
  const publishFailure = (failure: AdminRbacFailureKind): void => {
    publish({ kind: 'failure', failure, ...(projection ? { previous: projection } : {}) });
  };

  /** Clears state and enters authentication after a definite invalid session or self-revocation. */
  const requireAuthentication = (): void => {
    generation += 1;
    operation?.abort();
    operation = undefined;
    mutationDispatched = false;
    projection = undefined;
    recoveryRequired = false;
    options.setRecoveryRequired?.(false);
    publish({ kind: 'closed' });
    options.requestAuthentication();
  };

  /** Retains validated state and requires an explicit read-only reconciliation. */
  const requireReconciliation = (): void => {
    if (!projection) return;
    recoveryRequired = true;
    options.setRecoveryRequired?.(true);
    publish({ kind: 'indeterminate', previous: projection });
  };

  /** Cancels the current continuation and records uncertainty only after mutation dispatch. */
  const cancel = (reconcileDispatchedMutation = false): void => {
    const uncertain = reconcileDispatchedMutation && mutationDispatched;
    generation += 1;
    operation?.abort();
    operation = undefined;
    mutationDispatched = false;
    if (uncertain) requireReconciliation();
  };

  /** Loads both complete Application-owned RBAC collections. */
  const load = async (): Promise<void> => {
    if (disposed || operation) return;
    const context = options.readContext();
    const operations = options.readOperations();
    if (!operations?.listRoles || !operations.listPermissions) return;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    publish({ kind: 'loading', ...(projection ? { previous: projection } : {}) });
    try {
      const roleResult = await operations.listRoles(context.applicationId, controller.signal);
      if (!owns(capturedGeneration, context, controller)) return;
      if (roleResult.kind === 'session-invalid') {
        requireAuthentication();
        return;
      }
      if (roleResult.kind === 'failure') {
        publishFailure(roleResult.failure);
        return;
      }
      const permissionResult = await operations.listPermissions(
        context.applicationId,
        controller.signal,
      );
      if (!owns(capturedGeneration, context, controller)) return;
      if (permissionResult.kind === 'session-invalid') {
        requireAuthentication();
      } else if (permissionResult.kind === 'failure') {
        publishFailure(permissionResult.failure);
      } else {
        projection = {
          kind: 'ready',
          applicationId: context.applicationId,
          roles: roleResult.value,
          permissions: permissionResult.value,
        };
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish(projection);
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Reloads the assigned and available collections after one direct mapping mutation. */
  const reloadMappings = async (
    context: AdminApplicationRbacContext,
    roleId: string,
    controller: AbortController,
    capturedGeneration: number,
  ): Promise<void> => {
    const operations = options.readOperations();
    if (!operations?.listRolePermissions || !operations.listPermissions) return;
    const assignedResult = await operations.listRolePermissions(
      context.applicationId,
      roleId,
      controller.signal,
    );
    if (!owns(capturedGeneration, context, controller)) return;
    if (assignedResult.kind === 'session-invalid') {
      requireAuthentication();
      return;
    }
    if (assignedResult.kind === 'failure') {
      publishFailure(assignedResult.failure);
      return;
    }
    const permissionResult = await operations.listPermissions(
      context.applicationId,
      controller.signal,
    );
    if (!owns(capturedGeneration, context, controller)) return;
    if (permissionResult.kind === 'session-invalid') {
      requireAuthentication();
    } else if (permissionResult.kind === 'failure') {
      publishFailure(permissionResult.failure);
    } else {
      const assignedIds = new Set(assignedResult.value.map((permission) => permission.id));
      projection = {
        kind: 'ready',
        applicationId: context.applicationId,
        roles: projection?.roles ?? [],
        permissions: permissionResult.value,
        assignedPermissions: assignedResult.value,
        availablePermissions: permissionResult.value.filter(
          (permission) => !assignedIds.has(permission.id),
        ),
      };
      recoveryRequired = false;
      options.setRecoveryRequired?.(false);
      publish(projection);
    }
  };

  /** Handles the common fixed mutation outcomes before authoritative reconciliation. */
  const acceptsReload = (result: AdminRbacMutationResult | AdminRbacReductionResult): boolean => {
    mutationDispatched = false;
    if (result.kind === 'session-invalid') {
      requireAuthentication();
      return false;
    }
    if (result.kind === 'outcome-unknown') {
      requireReconciliation();
      return false;
    }
    if (result.kind === 'failure') {
      publishFailure(result.failure);
      return false;
    }
    if (result.kind === 'cancelled') return false;
    if ('reauthenticationRequired' in result && result.reauthenticationRequired) {
      requireAuthentication();
      return false;
    }
    return true;
  };

  /** Runs one ordinary role or permission mutation, then reloads complete authoritative state. */
  const mutateAndReload = async (
    invoke: (
      operations: Partial<AdminRbacOperations>,
      context: AdminApplicationRbacContext,
      signal: AbortSignal,
    ) => Promise<AdminRbacMutationResult | AdminRbacReductionResult>,
  ): Promise<void> => {
    if (disposed || operation || recoveryRequired) return;
    const context = options.readContext();
    const operations = options.readOperations();
    if (!operations) return;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    try {
      mutationDispatched = true;
      const result = await invoke(operations, context, controller.signal);
      if (!owns(capturedGeneration, context, controller)) return;
      if (!acceptsReload(result)) return;
      operation = undefined;
      await load();
    } finally {
      if (operation === controller) {
        operation = undefined;
        mutationDispatched = false;
      }
    }
  };

  /** Runs one direct permission mapping mutation and reloads both mapping collections. */
  const mutateMapping = async (
    roleId: string,
    permissionId: string,
    remove: boolean,
  ): Promise<void> => {
    if (disposed || operation || recoveryRequired) return;
    const context = options.readContext();
    const operations = options.readOperations();
    const invoke = remove ? operations?.removePermissions : operations?.assignPermissions;
    if (!invoke || !operations?.listRolePermissions || !operations.listPermissions) return;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    try {
      mutationDispatched = true;
      const result = await invoke(context.applicationId, roleId, [permissionId], controller.signal);
      if (!owns(capturedGeneration, context, controller)) return;
      if (!acceptsReload(result)) return;
      await reloadMappings(context, roleId, controller, capturedGeneration);
    } finally {
      if (operation === controller) {
        operation = undefined;
        mutationDispatched = false;
      }
    }
  };

  /** Loads both mapping collections before opening the focused management dialog. */
  const loadRolePermissions = async (roleId: string): Promise<void> => {
    if (disposed || operation || recoveryRequired || !projection) return;
    const context = options.readContext();
    const operations = options.readOperations();
    if (!operations?.listRolePermissions || !operations.listPermissions) return;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    publish({ kind: 'loading', previous: projection });
    try {
      await reloadMappings(context, roleId, controller, capturedGeneration);
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  return {
    load,
    reload: load,
    createRole: (input) =>
      mutateAndReload(
        (operations, context, signal) =>
          operations.createRole?.(context.applicationId, input, signal) ??
          Promise.resolve({ kind: 'cancelled' }),
      ),
    updateRole: (roleId, input) =>
      mutateAndReload(
        (operations, context, signal) =>
          operations.updateRole?.(context.applicationId, roleId, input, signal) ??
          Promise.resolve({ kind: 'cancelled' }),
      ),
    deleteRole: (roleId) =>
      mutateAndReload(
        (operations, context, signal) =>
          operations.deleteRole?.(context.applicationId, roleId, signal) ??
          Promise.resolve({ kind: 'cancelled' }),
      ),
    createPermission: (input) =>
      mutateAndReload(
        (operations, context, signal) =>
          operations.createPermission?.(context.applicationId, input, signal) ??
          Promise.resolve({ kind: 'cancelled' }),
      ),
    updatePermission: (permissionId, input) =>
      mutateAndReload(
        (operations, context, signal) =>
          operations.updatePermission?.(context.applicationId, permissionId, input, signal) ??
          Promise.resolve({ kind: 'cancelled' }),
      ),
    deletePermission: (permissionId) =>
      mutateAndReload(
        (operations, context, signal) =>
          operations.deletePermission?.(context.applicationId, permissionId, signal) ??
          Promise.resolve({ kind: 'cancelled' }),
      ),
    loadRolePermissions,
    assignPermission: (roleId, permissionId) => mutateMapping(roleId, permissionId, false),
    removePermission: (roleId, permissionId) => mutateMapping(roleId, permissionId, true),
    cancelActiveOperation: () => cancel(true),
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
