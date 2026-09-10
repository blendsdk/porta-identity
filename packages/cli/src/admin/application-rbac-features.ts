/** Application-specific composition for RBAC dialogs, controller operations, and state. */

import type { AdminDialogSurface } from './application-runtime.js';
import type { AdminApplicationSession } from './application.js';
import { createAdminApplicationRbacController } from './application-rbac-controller.js';
import type { AdminApplicationRbacController } from './application-rbac-controller.js';
import type { AdminApplication, AdminApplicationModule } from './application-state.js';
import type { AdminApplicationRbacIntent } from './application-rbac-workspace.js';
import {
  showCreatePermissionDialog,
  showCreateRoleDialog,
  showDeletePermissionDialog,
  showDeleteRoleDialog,
  showEditPermissionDialog,
  showEditRoleDialog,
  showManageRolePermissionsDialog,
} from './rbac-dialogs.js';
import type {
  AdminApplicationRbacProjection,
  AdminApplicationRbacViewState,
  AdminPermission,
  AdminRole,
} from './rbac-state.js';
import type { AdminCapabilities } from './state.js';

/** Current selected Application context required by every RBAC operation and dialog. */
export interface AdminApplicationRbacSelection {
  /** Immutable selected Application. */
  readonly application: AdminApplication;
  /** Complete module catalog loaded with the selected Application. */
  readonly modules: readonly AdminApplicationModule[];
}

/** Dependencies supplied by the existing Application and Client composition. */
export interface AdminApplicationRbacFeaturesOptions {
  /** Shared shell-owned modal surface. */
  readonly dialogs: AdminDialogSurface;
  /** Reads the current selected Application and its modules. */
  readonly readSelection: () => AdminApplicationRbacSelection | undefined;
  /** Reads the current authenticated operations. */
  readonly readSession: () => AdminApplicationSession | undefined;
  /** Reads the current verified-session generation. */
  readonly readSessionEpoch: () => number;
  /** Reads exact capabilities for mapping-dialog enablement. */
  readonly readCapabilities: () => AdminCapabilities | undefined;
  /** Runs one dialog through the shell's existing single-dialog owner. */
  readonly runDialog: <T>(work: (signal: AbortSignal) => Promise<T>) => Promise<T | undefined>;
  /** Publishes state to the currently mounted Application workspace. */
  readonly publishState: (state: AdminApplicationRbacViewState) => void;
  /** Re-enters the existing authentication flow after definite authority loss. */
  readonly requestAuthentication: () => void;
}

/** Narrow lifecycle used by the existing Application and Client composition. */
export interface AdminApplicationRbacFeatures {
  /** Returns the most recently published validated state. */
  readonly state: () => AdminApplicationRbacViewState;
  /** Synchronizes the controller when the selected Application changes. */
  readonly syncApplication: () => void;
  /** Handles one closed intent from the selected Application's RBAC pages. */
  readonly handleIntent: (intent: AdminApplicationRbacIntent) => void;
  /** Cancels in-flight controller work. Dialog cancellation remains shell-owned. */
  readonly cancelActiveOperation: () => void;
  /** Cancels unsafe work when the terminal cannot retain its dialog geometry. */
  readonly handleRecoverableGeometry: (recoverable: boolean) => void;
  /** Releases retained state and controller ownership. */
  readonly dispose: () => void;
}

/** Returns the complete retained projection, including recovery states. */
function retainedProjection(
  state: AdminApplicationRbacViewState,
): AdminApplicationRbacProjection | undefined {
  if (state.kind === 'ready') return state;
  if (state.kind === 'loading' || state.kind === 'failure' || state.kind === 'indeterminate') {
    return state.previous;
  }
  return undefined;
}

/** Creates the direct Application RBAC coordinator approved for the terminal shell. */
export function createAdminApplicationRbacFeatures(
  options: AdminApplicationRbacFeaturesOptions,
): AdminApplicationRbacFeatures {
  let currentState: AdminApplicationRbacViewState = { kind: 'closed' };
  let applicationId: string | undefined;
  let sessionEpoch = -1;
  let disposed = false;

  /** Publishes one state snapshot while retaining it for dialog target lookup. */
  const publishState = (state: AdminApplicationRbacViewState): void => {
    currentState = state;
    options.publishState(state);
  };

  const controller: AdminApplicationRbacController = createAdminApplicationRbacController({
    readContext: () => ({
      applicationId: options.readSelection()?.application.id ?? '',
      sessionEpoch: options.readSessionEpoch(),
    }),
    readOperations: () => options.readSession()?.rbac,
    publishState,
    requestAuthentication: options.requestAuthentication,
  });

  /** Returns a retained role owned by the current selected Application. */
  const role = (roleId: string): AdminRole | undefined =>
    retainedProjection(currentState)?.roles.find((candidate) => candidate.id === roleId);

  /** Returns a retained permission owned by the current selected Application. */
  const permission = (permissionId: string): AdminPermission | undefined =>
    retainedProjection(currentState)?.permissions.find(
      (candidate) => candidate.id === permissionId,
    );

  /** Opens and submits the focused create-role dialog. */
  async function createRole(): Promise<void> {
    const selection = options.readSelection();
    if (!selection) return;
    const result = await options.runDialog((signal) =>
      showCreateRoleDialog(options.dialogs.host, signal, selection.application),
    );
    if (result?.kind === 'create-role') await controller.createRole(result.input);
  }

  /** Opens and submits the focused role editor. */
  async function editRole(roleId: string): Promise<void> {
    const selection = options.readSelection();
    const target = role(roleId);
    if (!selection || !target) return;
    const result = await options.runDialog((signal) =>
      showEditRoleDialog(options.dialogs.host, signal, selection.application, target),
    );
    if (result?.kind === 'update-role') await controller.updateRole(target.id, result.input);
  }

  /** Confirms and permanently deletes one retained role. */
  async function deleteRole(roleId: string): Promise<void> {
    const selection = options.readSelection();
    const target = role(roleId);
    if (!selection || !target) return;
    const result = await options.runDialog((signal) =>
      showDeleteRoleDialog(options.dialogs.host, signal, selection.application, target),
    );
    if (result?.kind === 'delete-role') await controller.deleteRole(target.id);
  }

  /** Opens and submits the focused create-permission dialog. */
  async function createPermission(): Promise<void> {
    const selection = options.readSelection();
    if (!selection) return;
    const result = await options.runDialog((signal) =>
      showCreatePermissionDialog(
        options.dialogs.host,
        signal,
        selection.application,
        selection.modules,
      ),
    );
    if (result?.kind === 'create-permission') await controller.createPermission(result.input);
  }

  /** Opens and submits mutable metadata for one retained permission. */
  async function editPermission(permissionId: string): Promise<void> {
    const selection = options.readSelection();
    const target = permission(permissionId);
    if (!selection || !target) return;
    const result = await options.runDialog((signal) =>
      showEditPermissionDialog(
        options.dialogs.host,
        signal,
        selection.application,
        target,
        selection.modules,
      ),
    );
    if (result?.kind === 'update-permission') {
      await controller.updatePermission(target.id, result.input);
    }
  }

  /** Confirms and permanently deletes one retained permission. */
  async function deletePermission(permissionId: string): Promise<void> {
    const selection = options.readSelection();
    const target = permission(permissionId);
    if (!selection || !target) return;
    const result = await options.runDialog((signal) =>
      showDeletePermissionDialog(options.dialogs.host, signal, selection.application, target),
    );
    if (result?.kind === 'delete-permission') await controller.deletePermission(target.id);
  }

  /** Loads and executes exactly one direct permission mapping change. */
  async function manageRolePermissions(roleId: string): Promise<void> {
    const selection = options.readSelection();
    const target = role(roleId);
    if (!selection || !target) return;
    if (!(await controller.loadRolePermissions(target.id))) return;
    const projection = retainedProjection(currentState);
    if (!projection?.assignedPermissions || !projection.availablePermissions) return;
    const capabilities = options.readCapabilities();
    const result = await options.runDialog((signal) =>
      showManageRolePermissionsDialog(
        options.dialogs.host,
        signal,
        selection.application,
        target,
        projection.assignedPermissions ?? [],
        projection.availablePermissions ?? [],
        Boolean(capabilities?.canUpdateRoles && capabilities.canReadPermissions),
      ),
    );
    if (result?.kind === 'assign-permission') {
      await controller.assignPermission(result.roleId, result.permissionId);
    } else if (result?.kind === 'remove-permission') {
      await controller.removePermission(result.roleId, result.permissionId);
    }
  }

  return {
    state: () => currentState,
    syncApplication() {
      if (disposed) return;
      const nextApplicationId = options.readSelection()?.application.id;
      const nextSessionEpoch = options.readSessionEpoch();
      if (nextApplicationId === applicationId && nextSessionEpoch === sessionEpoch) return;
      controller.cancelActiveOperation();
      applicationId = nextApplicationId;
      sessionEpoch = nextSessionEpoch;
      publishState({ kind: 'closed' });
      if (applicationId) void controller.load();
    },
    handleIntent(intent) {
      if (disposed) return;
      if (intent.kind === 'reload') void controller.reload();
      else if (intent.kind === 'add-role') void createRole();
      else if (intent.kind === 'edit-role') void editRole(intent.roleId);
      else if (intent.kind === 'delete-role') void deleteRole(intent.roleId);
      else if (intent.kind === 'manage-role-permissions') {
        void manageRolePermissions(intent.roleId);
      } else if (intent.kind === 'add-permission') void createPermission();
      else if (intent.kind === 'edit-permission') void editPermission(intent.permissionId);
      else void deletePermission(intent.permissionId);
    },
    cancelActiveOperation() {
      controller.cancelActiveOperation();
    },
    handleRecoverableGeometry(recoverable) {
      if (!recoverable) controller.cancelActiveOperation();
    },
    dispose() {
      if (disposed) return;
      controller.dispose();
      currentState = { kind: 'closed' };
      applicationId = undefined;
      sessionEpoch = -1;
      disposed = true;
    },
  };
}
