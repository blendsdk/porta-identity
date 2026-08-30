/** Selected-organization workflow controller for user administration. */

import type { AdminCapabilities, AdminConnectionState } from './state.js';
import {
  showCreateUserDialog,
  showEditUserDialog,
  showInviteUserDialog,
  showPurgeUserDialog,
  showSetUserPasswordDialog,
  showUserConfirmationDialog,
  showUserReasonDialog,
} from './user-dialogs.js';
import type { AdminUserMutationResult, AdminUserOperations } from './user-service.js';
import type {
  AdminUserOutcome,
  AdminUserFailureKind,
  AdminUserProjection,
  AdminUserSelection,
  AdminUserStatus,
  AdminUserViewState,
} from './user-state.js';
import { createAdminUserWorkspace } from './user-workspace.js';
import type { AdminUserIntent, AdminUserWorkspace } from './user-workspace.js';
import { ADMIN_COMMANDS } from './presentation.js';
import type {
  AdminUserController,
  AdminUserControllerDialogs,
  AdminUserControllerOptions,
} from './user-controller-types.js';

export type {
  AdminUserController,
  AdminUserControllerDialogs,
  AdminUserControllerOptions,
} from './user-controller-types.js';

const DEFAULT_DIALOGS: AdminUserControllerDialogs = {
  create: showCreateUserDialog,
  invite: showInviteUserDialog,
  edit: showEditUserDialog,
  setPassword: showSetUserPasswordDialog,
  confirm: showUserConfirmationDialog,
  reason: showUserReasonDialog,
  purge: showPurgeUserDialog,
};

/** Mutation result shape shared by value-returning and void service operations. */
type ControllerMutationResult =
  | { readonly kind: 'success'; readonly value?: unknown }
  | Exclude<AdminUserMutationResult, { readonly kind: 'success' }>;

/** Capability that must still be present when a user mutation is dispatched. */
type UserMutationCapability = keyof Pick<
  AdminCapabilities,
  | 'canCreateUsers'
  | 'canInviteUsers'
  | 'canUpdateUsers'
  | 'canManageUserLifecycle'
  | 'canPurgeUsers'
>;

/** Returns the validated projection retained beneath transient state. */
function projection(state: AdminUserViewState): AdminUserProjection | undefined {
  if (state.kind === 'page') return { kind: 'page', page: state.page };
  if (state.kind === 'detail') return { ...state };
  if (state.kind === 'history') return { ...state };
  if (state.kind === 'loading' || state.kind === 'failure') return state.previous;
  return undefined;
}

/** Adds a fixed mutation outcome without changing validated remote data. */
function withOutcome(
  previous: AdminUserProjection | undefined,
  outcome: AdminUserOutcome,
): AdminUserViewState {
  if (!previous) {
    return outcome === 'outcome-unknown'
      ? { kind: 'indeterminate' }
      : { kind: 'failure', failure: outcome };
  }
  return { ...previous, outcome };
}

/** Creates the bounded selected-organization user workflow. */
export function createAdminUserController(
  options: AdminUserControllerOptions,
): AdminUserController {
  const dialogs: AdminUserControllerDialogs = { ...DEFAULT_DIALOGS, ...options.dialogs };
  const makeWorkspace = options.workspaceFactory ?? createAdminUserWorkspace;
  let workspace: AdminUserWorkspace | undefined;
  let contextKey: string | undefined;
  let organizationId: string | undefined;
  let capabilitiesKey = '';
  let state: AdminUserViewState = { kind: 'closed' };
  let query: { page: number; search?: string; status?: AdminUserStatus } = { page: 1 };
  let generation = 0;
  let operationGeneration = 0;
  let operation: AbortController | undefined;
  let operationPrevious: AdminUserProjection | undefined;
  let mutationDispatched = false;
  let dialogBusy = false;
  let visible = false;
  let recoverable = true;
  let recoveryRequired = false;
  let disposed = false;

  /** Updates deliberate-reconciliation ownership and the application command gate together. */
  const setRecoveryRequired = (required: boolean): void => {
    if (recoveryRequired === required) return;
    recoveryRequired = required;
    options.setRecoveryRequired?.(required);
  };

  /** Publishes one state only to the current same-context workspace. */
  const publish = (next: AdminUserViewState): void => {
    if (disposed) return;
    state = next;
    workspace?.setState(next);
  };

  /** Mounts the current workspace only while its context remains visible and recoverable. */
  const syncMount = (focus = true): void => {
    options.mountWorkspace(visible && recoverable && workspace ? workspace.content : null);
    if (focus && visible && recoverable) workspace?.focusCurrent();
  };

  /** Releases current asynchronous ownership without changing presentation state. */
  const releaseOperation = (controller: AbortController): void => {
    if (operation !== controller) return;
    operation = undefined;
    operationPrevious = undefined;
    mutationDispatched = false;
    if (dialogBusy) {
      dialogBusy = false;
      options.setDialogBusy(false);
    }
  };

  /** Returns true only for the still-current asynchronous continuation. */
  const owns = (
    contextGeneration: number,
    capturedOperation: number,
    controller: AbortController,
  ): boolean =>
    !disposed &&
    generation === contextGeneration &&
    operationGeneration === capturedOperation &&
    operation === controller &&
    !controller.signal.aborted;

  /** Enters the established application authentication flow. */
  const sessionInvalid = (): void => {
    generation += 1;
    operationGeneration += 1;
    operation?.abort();
    operation = undefined;
    operationPrevious = undefined;
    mutationDispatched = false;
    if (dialogBusy) {
      dialogBusy = false;
      options.setDialogBusy(false);
    }
    visible = false;
    workspace?.clear();
    syncMount();
    options.requestAuthentication();
  };

  /** Cancels only a replaceable read, leaving dialog and mutation ownership untouched. */
  const cancelRead = (): void => {
    if (!operation || dialogBusy || mutationDispatched) return;
    operationGeneration += 1;
    operation.abort();
    operation = undefined;
    operationPrevious = undefined;
  };

  /** Starts a replaceable read and retains only validated prior state while it runs. */
  const startRead = async <T>(
    invoke: () => Promise<
      | { readonly kind: 'success'; readonly value: T }
      | { readonly kind: 'session-invalid' }
      | { readonly kind: 'failure'; readonly failure: AdminUserFailureKind }
    >,
    accept: (value: T) => AdminUserViewState,
    reconcilesMutation = true,
  ): Promise<void> => {
    if (!organizationId || !options.readOperations()) return;
    cancelRead();
    if (operation) return;
    const controller = new AbortController();
    operation = controller;
    mutationDispatched = false;
    operationPrevious = projection(state);
    const contextGeneration = generation;
    const capturedOperation = ++operationGeneration;
    publish(
      operationPrevious ? { kind: 'loading', previous: operationPrevious } : { kind: 'loading' },
    );
    try {
      const result = await invoke();
      if (!owns(contextGeneration, capturedOperation, controller)) return;
      if (result.kind === 'session-invalid') {
        sessionInvalid();
      } else if (result.kind === 'success') {
        if (reconcilesMutation) setRecoveryRequired(false);
        publish(accept(result.value));
        if (visible && recoverable) workspace?.focusCurrent();
      } else {
        publish(
          operationPrevious
            ? { kind: 'failure', failure: result.failure, previous: operationPrevious }
            : { kind: 'failure', failure: result.failure },
        );
      }
    } finally {
      releaseOperation(controller);
    }
  };

  /** Loads the current exact query from the selected organization. */
  const loadPage = (): void => {
    const selectedOrganization = organizationId;
    const operations = options.readOperations();
    if (!selectedOrganization || !operations) return;
    void startRead(
      () => operations.list(selectedOrganization, { ...query }),
      (page) => ({ kind: 'page', page }),
    );
  };

  /** Loads one detail selected from the retained validated page. */
  const loadDetail = (userId: string): void => {
    const selectedOrganization = organizationId;
    const operations = options.readOperations();
    const previous = projection(state);
    const page = previous?.kind === 'page' ? previous.page : previous?.page;
    const selected = page?.data.find((row) => row.id === userId);
    if (!selectedOrganization || !operations || !page || !selected) return;
    void startRead(
      () => operations.get(selectedOrganization, userId),
      (value) => ({
        kind: 'detail',
        page,
        selected,
        detail: value.detail,
        etag: value.etag,
      }),
    );
  };

  /** Reloads the current target or page after a definite mutation success. */
  const reconcile = (previous: AdminUserProjection | undefined, purge = false): void => {
    if (!previous || previous.kind === 'page' || purge) {
      loadPage();
      return;
    }
    loadDetail(previous.selected.id);
  };

  /** Applies a fixed mutation result without optimistic local patching. */
  const finishMutation = (
    result: ControllerMutationResult,
    previous: AdminUserProjection | undefined,
    noReadSuccess: 'created' | 'invited' | undefined,
    purge = false,
  ): void => {
    if (result.kind === 'session-invalid') {
      sessionInvalid();
      return;
    }
    if (result.kind === 'success') {
      setRecoveryRequired(false);
      const current = options.readState();
      if (current.kind === 'authenticated' && current.capabilities.canReadUsers) {
        reconcile(previous, purge);
      } else if (noReadSuccess) {
        visible = true;
        publish({ kind: 'success', action: noReadSuccess });
        syncMount();
      }
      return;
    }
    if (result.kind === 'outcome-unknown') {
      const current = options.readState();
      setRecoveryRequired(current.kind === 'authenticated' && current.capabilities.canReadUsers);
      visible = true;
      publish(withOutcome(previous, 'outcome-unknown'));
      syncMount();
      return;
    }
    visible = true;
    publish(withOutcome(previous, result.failure));
    syncMount();
  };

  /** Opens one typed dialog and dispatches at most one resulting mutation. */
  const runMutation = async <Choice>(
    open: (signal: AbortSignal) => Promise<Choice>,
    choose: (choice: Choice) => Promise<ControllerMutationResult> | undefined,
    requiredCapability: UserMutationCapability,
    noReadSuccess?: 'created' | 'invited',
    purge = false,
  ): Promise<void> => {
    if (disposed || operation || dialogBusy || options.isApplicationBusy()) return;
    const current = options.readState();
    if (current.kind !== 'authenticated' || !current.organization) return;
    if (!current.capabilities[requiredCapability]) return;
    if (recoveryRequired && current.capabilities.canReadUsers) return;
    const controller = new AbortController();
    operation = controller;
    operationPrevious = projection(state);
    mutationDispatched = false;
    dialogBusy = true;
    options.setDialogBusy(true);
    const contextGeneration = generation;
    const capturedOperation = ++operationGeneration;
    try {
      const choice = await open(controller.signal);
      if (!owns(contextGeneration, capturedOperation, controller)) return;
      const latest = options.readState();
      if (
        latest.kind !== 'authenticated' ||
        latest.organization?.id !== organizationId ||
        !latest.capabilities[requiredCapability]
      )
        return;
      const request = choose(choice);
      if (!request) return;
      mutationDispatched = true;
      const result = await request;
      if (!owns(contextGeneration, capturedOperation, controller)) return;
      operation = undefined;
      mutationDispatched = false;
      if (dialogBusy) {
        dialogBusy = false;
        options.setDialogBusy(false);
      }
      const previous = operationPrevious;
      operationPrevious = undefined;
      finishMutation(result, previous, noReadSuccess, purge);
    } finally {
      releaseOperation(controller);
    }
  };

  /** Returns the currently validated selected-user projection. */
  const selection = (): AdminUserSelection | undefined => {
    const current = projection(state);
    return current?.kind === 'detail' || current?.kind === 'history' ? current : undefined;
  };

  /** Dispatches one already-confirmed selected-user mutation. */
  const selectedMutation = <Choice>(
    open: (selected: AdminUserSelection, signal: AbortSignal) => Promise<Choice>,
    choose: (
      selected: AdminUserSelection,
      choice: Choice,
      operations: AdminUserOperations,
      selectedOrganization: string,
    ) => Promise<ControllerMutationResult> | undefined,
    requiredCapability: UserMutationCapability,
    purge = false,
  ): void => {
    const selected = selection();
    const operations = options.readOperations();
    const selectedOrganization = organizationId;
    if (!selected || !operations || !selectedOrganization) return;
    void runMutation(
      (signal) => open(selected, signal),
      (choice) => choose(selected, choice, operations, selectedOrganization),
      requiredCapability,
      undefined,
      purge,
    );
  };

  /** Handles one closed workspace intent. */
  const handleIntent = (intent: AdminUserIntent): void => {
    const current = options.readState();
    if (
      !organizationId ||
      !options.readOperations() ||
      disposed ||
      current.kind !== 'authenticated' ||
      current.organization?.id !== organizationId
    )
      return;
    const requiredCapability: keyof AdminCapabilities =
      intent.kind === 'purge'
        ? 'canPurgeUsers'
        : intent.kind === 'edit' ||
            intent.kind === 'set-password' ||
            intent.kind === 'clear-password' ||
            intent.kind === 'verify-email'
          ? 'canUpdateUsers'
          : intent.kind === 'suspend' ||
              intent.kind === 'unsuspend' ||
              intent.kind === 'lock' ||
              intent.kind === 'unlock' ||
              intent.kind === 'deactivate' ||
              intent.kind === 'reactivate'
            ? 'canManageUserLifecycle'
            : 'canReadUsers';
    if (intent.kind !== 'back' && !current.capabilities[requiredCapability]) return;
    if (intent.kind === 'search') {
      query = {
        ...query,
        page: 1,
        ...(intent.value ? { search: intent.value } : { search: undefined }),
      };
      loadPage();
      return;
    }
    if (intent.kind === 'filter') {
      query = {
        ...query,
        page: 1,
        ...(intent.status ? { status: intent.status } : { status: undefined }),
      };
      loadPage();
      return;
    }
    if (intent.kind === 'page') {
      query = { ...query, page: intent.page };
      loadPage();
      return;
    }
    if (intent.kind === 'select') {
      loadDetail(intent.userId);
      return;
    }
    if (intent.kind === 'back') {
      cancelRead();
      const previous = projection(state);
      if (previous && previous.kind !== 'page') publish({ kind: 'page', page: previous.page });
      return;
    }
    if (intent.kind === 'retry') {
      const previous = projection(state);
      if (previous?.kind === 'detail' || previous?.kind === 'history')
        loadDetail(previous.selected.id);
      else loadPage();
      return;
    }
    if (intent.kind === 'history') {
      const selected = selection();
      const selectedOrganization = organizationId;
      const operations = options.readOperations();
      if (!operations) return;
      if (!selected) return;
      void startRead(
        () => operations.getHistory(selectedOrganization, selected.selected.id),
        (history) => ({ ...selected, kind: 'history', history }),
        false,
      );
      return;
    }
    if (intent.kind === 'edit') {
      selectedMutation(
        (selected, signal) => dialogs.edit(options.host, signal, selected.detail),
        (selected, choice, operations, selectedOrganization) => {
          return choice.kind === 'update'
            ? operations.update(
                selectedOrganization,
                selected.selected.id,
                choice.input,
                selected.etag ?? undefined,
              )
            : undefined;
        },
        'canUpdateUsers',
      );
      return;
    }
    if (intent.kind === 'set-password') {
      selectedMutation(
        (selected, signal) => dialogs.setPassword(options.host, signal, selected.detail.email),
        (selected, choice, operations, selectedOrganization) => {
          return choice.kind === 'set-password'
            ? operations.setPassword(selectedOrganization, selected.selected.id, choice.input)
            : undefined;
        },
        'canUpdateUsers',
      );
      return;
    }
    if (intent.kind === 'suspend' || intent.kind === 'lock') {
      const action = intent.kind;
      selectedMutation(
        (selected, signal) => dialogs.reason(options.host, signal, action, selected.detail.email),
        (selected, choice, operations, selectedOrganization) => {
          if (choice.kind === 'suspend')
            return operations.suspend(selectedOrganization, selected.selected.id, choice.reason);
          if (choice.kind === 'lock')
            return operations.lock(selectedOrganization, selected.selected.id, choice.reason);
          return undefined;
        },
        'canManageUserLifecycle',
      );
      return;
    }
    if (intent.kind === 'purge') {
      selectedMutation(
        (selected, signal) => dialogs.purge(options.host, signal, selected.detail.email),
        (selected, choice, operations, selectedOrganization) =>
          choice.kind === 'purge'
            ? operations.purge(selectedOrganization, selected.selected.id)
            : undefined,
        'canPurgeUsers',
        true,
      );
      return;
    }
    const action = intent.kind;
    if (
      action === 'clear-password' ||
      action === 'verify-email' ||
      action === 'unsuspend' ||
      action === 'unlock' ||
      action === 'deactivate' ||
      action === 'reactivate'
    ) {
      selectedMutation(
        (selected, signal) => dialogs.confirm(options.host, signal, action, selected.detail.email),
        (selected, choice, operations, selectedOrganization) => {
          if (choice.kind === 'cancel') return undefined;
          const userId = selected.selected.id;
          if (choice.kind === 'clear-password')
            return operations.clearPassword(selectedOrganization, userId);
          if (choice.kind === 'verify-email')
            return operations.verifyEmail(selectedOrganization, userId);
          if (choice.kind === 'unsuspend')
            return operations.unsuspend(selectedOrganization, userId);
          if (choice.kind === 'unlock') return operations.unlock(selectedOrganization, userId);
          if (choice.kind === 'deactivate')
            return operations.deactivate(selectedOrganization, userId);
          return operations.reactivate(selectedOrganization, userId);
        },
        action === 'clear-password' || action === 'verify-email'
          ? 'canUpdateUsers'
          : 'canManageUserLifecycle',
      );
    }
  };

  /** Creates a workspace for the current exact capability snapshot. */
  const replaceWorkspace = (
    connection: Extract<AdminConnectionState, { kind: 'authenticated' }>,
  ): void => {
    workspace?.dispose();
    workspace = makeWorkspace({
      capabilities: connection.capabilities,
      onIntent: handleIntent,
      focusView: (view) => options.host.loop.focusView(view),
    });
    workspace.setState(state);
    syncMount();
  };

  /** Cancels the owned operation and preserves only a truthful same-context projection. */
  const cancelActiveOperation = (): void => {
    if (!operation) return;
    const previous = operationPrevious;
    const indeterminate = mutationDispatched;
    operationGeneration += 1;
    operation.abort();
    const controller = operation;
    operation = undefined;
    mutationDispatched = false;
    operationPrevious = undefined;
    if (dialogBusy) {
      dialogBusy = false;
      options.setDialogBusy(false);
    }
    if (indeterminate) {
      const current = options.readState();
      setRecoveryRequired(current.kind === 'authenticated' && current.capabilities.canReadUsers);
      visible = true;
      publish(withOutcome(previous, 'outcome-unknown'));
      syncMount();
    } else if (previous) publish(previous);
    releaseOperation(controller);
  };

  return {
    syncContext: (connection, sessionEpoch) => {
      const valid = connection.kind === 'authenticated' && connection.organization;
      if (!valid || !options.readOperations()) {
        generation += 1;
        operationGeneration += 1;
        operation?.abort();
        operation = undefined;
        operationPrevious = undefined;
        mutationDispatched = false;
        contextKey = undefined;
        organizationId = undefined;
        if (dialogBusy) {
          dialogBusy = false;
          options.setDialogBusy(false);
        }
        setRecoveryRequired(false);
        visible = false;
        workspace?.clear();
        workspace?.dispose();
        workspace = undefined;
        state = { kind: 'closed' };
        syncMount();
        return;
      }
      const nextKey = `${sessionEpoch}:${connection.organization.id}`;
      const nextCapabilities = JSON.stringify(connection.capabilities);
      if (nextKey !== contextKey) {
        generation += 1;
        operationGeneration += 1;
        operation?.abort();
        operation = undefined;
        operationPrevious = undefined;
        mutationDispatched = false;
        contextKey = nextKey;
        organizationId = connection.organization.id;
        capabilitiesKey = nextCapabilities;
        if (dialogBusy) {
          dialogBusy = false;
          options.setDialogBusy(false);
        }
        setRecoveryRequired(false);
        visible = false;
        workspace?.clear();
        state = { kind: 'closed' };
        query = { page: 1 };
        replaceWorkspace(connection);
      } else if (nextCapabilities !== capabilitiesKey) {
        capabilitiesKey = nextCapabilities;
        cancelActiveOperation();
        replaceWorkspace(connection);
      }
    },
    handleCommand: (command) => {
      if (
        command !== ADMIN_COMMANDS.browseUsers &&
        command !== ADMIN_COMMANDS.createUser &&
        command !== ADMIN_COMMANDS.inviteUser
      )
        return false;
      const current = options.readState();
      const operations = options.readOperations();
      if (current.kind !== 'authenticated' || !current.organization || !operations) return true;
      if (command === ADMIN_COMMANDS.browseUsers) {
        if (!current.capabilities.canReadUsers) return true;
        visible = true;
        syncMount();
        query = { page: 1 };
        loadPage();
        return true;
      }
      if (command === ADMIN_COMMANDS.createUser) {
        if (!current.capabilities.canCreateUsers) return true;
        const selectedOrganization = current.organization.id;
        void runMutation(
          (signal) => dialogs.create(options.host, signal),
          (choice) => {
            return choice.kind === 'create'
              ? operations.create(selectedOrganization, choice.input)
              : undefined;
          },
          'canCreateUsers',
          'created',
        );
        return true;
      }
      if (!current.capabilities.canInviteUsers) return true;
      const selectedOrganization = current.organization.id;
      void runMutation(
        (signal) =>
          dialogs.invite(options.host, signal, async (input) => {
            const result = await operations.previewInvitation(selectedOrganization, input);
            if (signal.aborted) return { kind: 'failure', failure: 'unavailable' };
            if (result.kind !== 'session-invalid') return result;
            sessionInvalid();
            return { kind: 'failure', failure: 'unauthorized' };
          }),
        (choice) => {
          return choice.kind === 'invite'
            ? operations.invite(selectedOrganization, choice.input)
            : undefined;
        },
        'canInviteUsers',
        'invited',
      );
      return true;
    },
    cancelActiveOperation,
    handleRecoverableGeometry: (nextRecoverable) => {
      if (recoverable === nextRecoverable) return;
      recoverable = nextRecoverable;
      if (!recoverable) cancelActiveOperation();
      syncMount(!recoverable);
      if (recoverable && visible) {
        const recoveryGeneration = generation;
        queueMicrotask(() => {
          if (disposed || !recoverable || generation !== recoveryGeneration) return;
          workspace?.setState(state);
          workspace?.focusCurrent();
        });
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation += 1;
      operationGeneration += 1;
      operation?.abort();
      operation = undefined;
      if (dialogBusy) {
        dialogBusy = false;
        options.setDialogBusy(false);
      }
      workspace?.clear();
      workspace?.dispose();
      workspace = undefined;
      options.mountWorkspace(null);
    },
  };
}
