/** Exact-context orchestration for direct roles assigned to one selected user. */

import type { AdminApplication, AdminApplicationReadResult } from './application-state.js';
import type { AdminRbacOperations } from './rbac-service.js';
import type {
  AdminRbacFailureKind,
  AdminRbacMutationResult,
  AdminRbacReductionResult,
  AdminRole,
} from './rbac-state.js';
import type {
  AdminAssignedUserRole,
  AdminUserRoleReadyProjection,
  AdminUserRoleViewState,
} from './user-role-dialog.js';

/** Immutable owner used to reject work from an old organization, user, or session. */
export interface AdminUserRoleContext {
  /** Organization that owns the selected user. */
  readonly organizationId: string;
  /** Selected user whose direct roles are being managed. */
  readonly userId: string;
  /** Epoch advanced whenever the verified session is replaced. */
  readonly sessionEpoch: number;
}

/** Exact RBAC operations required by the selected-user workflow. */
export type AdminUserRoleOperations = Pick<
  AdminRbacOperations,
  'listUserRoles' | 'listRoles' | 'assignUserRoles' | 'removeUserRoles'
>;

/** Dependencies for one selected-user role controller. */
export interface AdminUserRoleControllerOptions {
  /** Reads the latest selected organization, user, and verified session. */
  readonly readContext: () => AdminUserRoleContext;
  /** Reads validated RBAC operations from the current authenticated session. */
  readonly readOperations: () => AdminUserRoleOperations | undefined;
  /** Loads the complete validated application catalog when that capability is available. */
  readonly listApplications: (
    signal?: AbortSignal,
  ) => Promise<AdminApplicationReadResult<readonly AdminApplication[]>>;
  /** Publishes immutable validated state to the focused dialog. */
  readonly publishState: (state: AdminUserRoleViewState) => void;
  /** Enters the existing authentication flow after a definite session transition. */
  readonly requestAuthentication: () => void;
  /** Gates sibling mutations while an unknown outcome awaits explicit Reload. */
  readonly setRecoveryRequired?: (required: boolean) => void;
}

/** Direct selected-user role workflow boundary. */
export interface AdminUserRoleController {
  /** Loads direct assignments and the readable application catalog. */
  readonly load: () => Promise<void>;
  /** Loads unassigned roles for one application selected by Add. */
  readonly loadAvailableRoles: (applicationId: string) => Promise<void>;
  /** Assigns one role and reloads authoritative assignments. */
  readonly assignRole: (roleId: string) => Promise<void>;
  /** Removes one role and reloads authoritative assignments. */
  readonly removeRole: (roleId: string) => Promise<void>;
  /** Performs deliberate read-only reconciliation without replaying a mutation. */
  readonly reload: () => Promise<void>;
  /** Cancels owned work and requires reconciliation after a dispatched mutation. */
  readonly cancelActiveOperation: () => void;
  /** Releases the controller and clears protected state. */
  readonly dispose: () => void;
}

/** Creates the focused selected-user role workflow controller. */
export function createAdminUserRoleController(
  options: AdminUserRoleControllerOptions,
): AdminUserRoleController {
  let generation = 0;
  let operation: AbortController | undefined;
  let mutationDispatched = false;
  let projection: AdminUserRoleReadyProjection | undefined;
  let recoveryRequired = false;
  let disposed = false;

  /** Publishes only while this controller still owns the focused dialog. */
  const publish = (state: AdminUserRoleViewState): void => {
    if (!disposed) options.publishState(state);
  };

  /** Confirms exact organization, user, and session ownership for one continuation. */
  const owns = (
    capturedGeneration: number,
    context: AdminUserRoleContext,
    controller: AbortController,
  ): boolean => {
    const current = options.readContext();
    return (
      !disposed &&
      generation === capturedGeneration &&
      operation === controller &&
      !controller.signal.aborted &&
      current.organizationId === context.organizationId &&
      current.userId === context.userId &&
      current.sessionEpoch === context.sessionEpoch
    );
  };

  /** Publishes a fixed failure while retaining the last validated role data. */
  const publishFailure = (failure: AdminRbacFailureKind): void => {
    publish({ kind: 'failure', failure, ...(projection ? { previous: projection } : {}) });
  };

  /** Clears protected state and enters the existing authentication flow. */
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

  /** Retains validated state until an explicit read-only Reload reconciles it. */
  const requireReconciliation = (): void => {
    recoveryRequired = true;
    options.setRecoveryRequired?.(true);
    publish({ kind: 'indeterminate', ...(projection ? { previous: projection } : {}) });
  };

  /** Cancels one owned continuation and records uncertainty only after dispatch. */
  const cancel = (reconcileDispatchedMutation = false): void => {
    const uncertain = reconcileDispatchedMutation && mutationDispatched;
    generation += 1;
    operation?.abort();
    operation = undefined;
    mutationDispatched = false;
    if (uncertain) requireReconciliation();
  };

  /** Adds safe application labels without changing role identity or ownership. */
  const assignedRows = (
    roles: readonly AdminRole[],
    applications: readonly AdminApplication[],
  ): readonly AdminAssignedUserRole[] => {
    const names = new Map(applications.map((application) => [application.id, application.name]));
    return Object.freeze(
      roles.map((role) => {
        const applicationName = names.get(role.applicationId);
        return Object.freeze({ ...role, ...(applicationName ? { applicationName } : {}) });
      }),
    );
  };

  /** Loads direct assignments and readable applications for the exact current context. */
  const load = async (): Promise<void> => {
    if (disposed || operation) return;
    const context = options.readContext();
    const operations = options.readOperations();
    if (!operations) return;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    try {
      const roleResult = await operations.listUserRoles(
        context.organizationId,
        context.userId,
        controller.signal,
      );
      if (!owns(capturedGeneration, context, controller)) return;
      if (roleResult.kind === 'session-invalid') {
        requireAuthentication();
        return;
      }
      if (roleResult.kind === 'failure') {
        publishFailure(roleResult.failure);
        return;
      }
      const applicationResult = await options.listApplications(controller.signal);
      if (!owns(capturedGeneration, context, controller)) return;
      if (applicationResult.kind === 'session-invalid') {
        requireAuthentication();
      } else if (applicationResult.kind === 'failure') {
        publishFailure(applicationResult.failure);
      } else {
        projection = {
          kind: 'ready',
          organizationId: context.organizationId,
          userId: context.userId,
          assignedRoles: assignedRows(roleResult.value, applicationResult.value),
          applications: applicationResult.value,
          availableRoles: [],
        };
        recoveryRequired = false;
        options.setRecoveryRequired?.(false);
        publish(projection);
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Loads one application's roles and removes assignments already held by the user. */
  const loadAvailableRoles = async (applicationId: string): Promise<void> => {
    if (disposed || operation || recoveryRequired) return;
    const context = options.readContext();
    const operations = options.readOperations();
    if (!operations) return;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    try {
      const result = await operations.listRoles(applicationId, controller.signal);
      if (!owns(capturedGeneration, context, controller)) return;
      if (result.kind === 'session-invalid') {
        requireAuthentication();
      } else if (result.kind === 'failure') {
        publishFailure(result.failure);
      } else if (projection) {
        const assignedIds = new Set(projection.assignedRoles.map((role) => role.id));
        projection = {
          ...projection,
          availableRoles: Object.freeze(result.value.filter((role) => !assignedIds.has(role.id))),
        };
        publish(projection);
      }
    } finally {
      if (operation === controller) operation = undefined;
    }
  };

  /** Interprets one mutation result before authoritative reconciliation. */
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

  /** Runs one one-role mutation and reloads only after a definite committed success. */
  const mutate = async (roleId: string, remove: boolean): Promise<void> => {
    if (disposed || operation || recoveryRequired) return;
    const context = options.readContext();
    const operations = options.readOperations();
    if (!operations) return;
    const controller = new AbortController();
    operation = controller;
    const capturedGeneration = ++generation;
    try {
      mutationDispatched = true;
      const result = remove
        ? await operations.removeUserRoles(
            context.organizationId,
            context.userId,
            [roleId],
            controller.signal,
          )
        : await operations.assignUserRoles(
            context.organizationId,
            context.userId,
            [roleId],
            controller.signal,
          );
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

  return {
    load,
    loadAvailableRoles,
    assignRole: (roleId) => mutate(roleId, false),
    removeRole: (roleId) => mutate(roleId, true),
    reload: load,
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
