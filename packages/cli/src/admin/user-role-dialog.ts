/** Focused DataGrid dialog for direct roles assigned to one selected user. */

import {
  Button,
  col,
  ComboBox,
  cover,
  createRoot,
  DataGrid,
  Dialog,
  effect,
  fixed,
  grow,
  Label,
  row,
  signal,
  sortRows,
  spacer,
  Text,
} from '@jsvision/ui';
import type { Column, Signal, SortState, View } from '@jsvision/ui';

import type { AdminApplication } from './application-state.js';
import type { AdminRbacFailureKind, AdminRole } from './rbac-state.js';
import type { AdminCapabilities } from './state.js';

/** Assigned role with an optional validated application label for presentation. */
export interface AdminAssignedUserRole extends AdminRole {
  /** Application name when the current session may read the application catalog. */
  readonly applicationName?: string;
}

/** Last complete validated projection retained by the focused dialog. */
export interface AdminUserRoleReadyProjection {
  /** Ready-state discriminator. */
  readonly kind: 'ready';
  /** Organization that owns the selected user. */
  readonly organizationId: string;
  /** Selected user whose assignments are displayed. */
  readonly userId: string;
  /** Complete direct role assignments for the selected user. */
  readonly assignedRoles: readonly AdminAssignedUserRole[];
  /** Applications visible to the current session. */
  readonly applications: readonly AdminApplication[];
  /** Unassigned roles for the application currently chosen by Add. */
  readonly availableRoles: readonly AdminRole[];
  /** Application that owns `availableRoles`; absent while no successful role read is current. */
  readonly availableRolesApplicationId?: string;
}

/** Complete state accepted by the focused User Roles dialog. */
export type AdminUserRoleViewState =
  | { readonly kind: 'closed' }
  | AdminUserRoleReadyProjection
  | { readonly kind: 'indeterminate'; readonly previous?: AdminUserRoleReadyProjection }
  | {
      readonly kind: 'failure';
      readonly failure: AdminRbacFailureKind;
      readonly previous?: AdminUserRoleReadyProjection;
    };

/** Closed set of direct actions emitted by the focused dialog. */
export type AdminUserRoleIntent =
  | { readonly kind: 'load-available'; readonly applicationId: string }
  | { readonly kind: 'assign'; readonly roleId: string }
  | { readonly kind: 'remove'; readonly roleId: string }
  | { readonly kind: 'reload' }
  | { readonly kind: 'close' };

/** Construction inputs for one selected user's role dialog. */
export interface AdminUserRoleDialogOptions {
  /** Selected organization label and immutable owner. */
  readonly organization: { readonly id: string; readonly name: string };
  /** Selected user label and immutable owner. */
  readonly user: { readonly id: string; readonly label: string };
  /** Exact capabilities from the current verified session. */
  readonly capabilities: AdminCapabilities;
  /** Current terminal surface used to keep the modal fully visible. */
  readonly viewport: { readonly width: number; readonly height: number };
  /** Receives one explicit dialog action. */
  readonly onIntent: (intent: AdminUserRoleIntent) => void;
  /** Focuses a mounted control through the owning application loop. */
  readonly focusView?: (view: View) => void;
}

/** Mounted owner for the focused User Roles dialog. */
export interface AdminUserRoleDialog {
  /** Dialog mounted by the selected-user controller. */
  readonly content: Dialog;
  /** Replaces the complete validated projection. */
  readonly setState: (state: AdminUserRoleViewState) => void;
  /** Restores focus to the current grid or choice. */
  readonly focusCurrent: () => void;
  /** Clears protected role data without disposing the owner. */
  readonly clear: () => void;
  /** Releases retained rows and reactive sort observers. */
  readonly dispose: () => void;
}

const FAILURE_LABELS: Readonly<Record<AdminRbacFailureKind, string>> = {
  validation: 'Validation failed',
  unauthorized: 'Not authorized',
  conflict: 'Conflict',
  unavailable: 'Service unavailable',
  'invalid-response': 'Invalid server response',
};

/** Returns the last validated projection retained under a fixed status. */
function retainedProjection(
  state: AdminUserRoleViewState,
): AdminUserRoleReadyProjection | undefined {
  if (state.kind === 'ready') return state;
  if (state.kind === 'failure' || state.kind === 'indeterminate') return state.previous;
  return undefined;
}

/** Returns the fixed safe notice for a non-ready state. */
function stateNotice(state: AdminUserRoleViewState): string | undefined {
  if (state.kind === 'indeterminate') return 'The operation outcome is unknown; reload is required';
  if (state.kind === 'failure') return FAILURE_LABELS[state.failure];
  return undefined;
}

/** Clears positional selection whenever the DataGrid display order changes. */
function clearSelectionOnSort(sort: Signal<SortState>, selected: Signal<number>): () => void {
  return createRoot((dispose) => {
    let initialized = false;
    effect(() => {
      sort();
      if (initialized) selected.set(-1);
      initialized = true;
    });
    return dispose;
  });
}

/** Creates the direct focused dialog without a reusable CRUD abstraction. */
export function createAdminUserRoleDialog(
  options: AdminUserRoleDialogOptions,
): AdminUserRoleDialog {
  const content = new Dialog({
    title: `Roles for ${options.user.label}`,
    width: Math.max(1, Math.min(72, options.viewport.width)),
    height: Math.max(1, Math.min(20, options.viewport.height)),
    centered: true,
  });
  content.closable = false;
  content.resizable = false;
  content.zoomable = false;
  content.background = 'dialog';
  let state: AdminUserRoleViewState = { kind: 'closed' };
  let rows = signal<AdminAssignedUserRole[]>([]);
  let selected = signal(-1);
  let sort = signal<SortState>(null);
  let currentFocus: View | undefined;
  let selectedApplicationId: string | undefined;
  let adding = false;
  let confirming: AdminAssignedUserRole | undefined;
  let disposeSort = (): void => undefined;
  let disposeApplicationChoice = (): void => undefined;
  let disposed = false;

  /** Removes every currently rendered child before rebuilding the dialog. */
  const clearChildren = (): void => {
    for (const child of [...content.children]) content.remove(child);
    currentFocus = undefined;
  };

  /** Resolves the selected assigned role after the current sort is applied. */
  const selectedRole = (columns: Column<AdminAssignedUserRole>[]) =>
    sortRows(rows(), columns, sort())[selected()];

  /** Builds columns using an application name only when one is safely available. */
  const columnsFor = (
    projection: AdminUserRoleReadyProjection | undefined,
  ): Column<AdminAssignedUserRole>[] => {
    const applicationNames = new Map(
      (options.capabilities.canReadApplications ? (projection?.applications ?? []) : []).map(
        (application) => [application.id, application.name],
      ),
    );
    return [
      {
        title: 'Application',
        accessor: (role) =>
          role.applicationName ?? applicationNames.get(role.applicationId) ?? role.applicationId,
        width: '1fr',
        minWidth: 18,
      },
      { title: 'Name', accessor: (role) => role.name, width: '1fr', minWidth: 18 },
      { title: 'Slug', accessor: (role) => role.slug, width: '1fr', minWidth: 18 },
    ];
  };

  /** Restores the assigned-role grid and direct action row. */
  const renderAssignments = (projection: AdminUserRoleReadyProjection | undefined): void => {
    disposeSort();
    rows = signal([...(projection?.assignedRoles ?? [])]);
    selected = signal(-1);
    sort = signal<SortState>(null);
    disposeSort = clearSelectionOnSort(sort, selected);
    const columns = columnsFor(projection);
    const grid = new DataGrid<AdminAssignedUserRole>({
      rows,
      columns,
      selected,
      sort,
      zebra: true,
    });
    const mutationsBlocked = state.kind === 'indeterminate';
    const addAllowed =
      !mutationsBlocked &&
      options.capabilities.canAssignRoles &&
      options.capabilities.canReadApplications;
    const add = new Button('Add', {
      disabled: !addAllowed,
      onClick: () => {
        adding = true;
        selectedApplicationId = undefined;
        render();
      },
    });
    const remove = new Button('Remove', {
      disabled: () =>
        mutationsBlocked || !options.capabilities.canAssignRoles || !selectedRole(columns),
      onClick: () => {
        const target = selectedRole(columns);
        if (target) {
          confirming = target;
          render();
        }
      },
    });
    const reload = new Button('Reload', {
      onClick: () => options.onIntent({ kind: 'reload' }),
    });
    const close = new Button('Close', {
      onClick: () => options.onIntent({ kind: 'close' }),
    });
    const notices = [
      stateNotice(state),
      !options.capabilities.canAssignRoles ? 'Role assign permission required.' : undefined,
      options.capabilities.canAssignRoles && !options.capabilities.canReadApplications
        ? 'Application read permission required to add a role.'
        : undefined,
    ].filter((notice): notice is string => notice !== undefined);
    content.add(
      cover(
        col(
          { gap: 1, padding: 1 },
          fixed(new Text(`Organization: ${options.organization.name}`), 1),
          ...notices.map((notice) => fixed(new Text(notice), 1)),
          grow(grid),
          fixed(row({ gap: 1 }, add, remove, spacer(), reload, close), 2),
        ),
      ),
    );
    currentFocus = grid.rows;
  };

  /** Builds the two-step application and unassigned-role choice. */
  const renderAdd = (projection: AdminUserRoleReadyProjection): void => {
    const availableRoles =
      selectedApplicationId !== undefined &&
      projection.availableRolesApplicationId === selectedApplicationId
        ? projection.availableRoles
        : [];
    const application = signal<AdminApplication | null>(
      projection.applications.find((item) => item.id === selectedApplicationId) ?? null,
    );
    const role = signal<AdminRole | null>(null);
    const applicationChoice = new ComboBox<AdminApplication>({
      items: signal([...projection.applications]),
      getText: (item) => `${item.name} — ${item.slug}`,
      value: application,
      editable: false,
    });
    const roleChoice = new ComboBox<AdminRole>({
      items: signal([...availableRoles]),
      getText: (item) => `${item.name} — ${item.slug}`,
      value: role,
      editable: false,
    });
    disposeApplicationChoice();
    disposeApplicationChoice = createRoot((dispose) => {
      effect(() => {
        const next = application();
        if (next && next.id !== selectedApplicationId) {
          selectedApplicationId = next.id;
          role.set(null);
          options.onIntent({ kind: 'load-available', applicationId: next.id });
        }
      });
      return dispose;
    });
    const assign = new Button('Assign', {
      disabled: () =>
        role() === null || projection.availableRolesApplicationId !== selectedApplicationId,
      onClick: () => {
        const target = role.peek();
        if (
          target &&
          selectedApplicationId !== undefined &&
          projection.availableRolesApplicationId === selectedApplicationId &&
          target.applicationId === selectedApplicationId
        ) {
          adding = false;
          selectedApplicationId = undefined;
          options.onIntent({ kind: 'assign', roleId: target.id });
          render();
        }
      },
    });
    const cancel = new Button('Cancel', {
      onClick: () => {
        adding = false;
        selectedApplicationId = undefined;
        render();
      },
    });
    content.add(
      cover(
        col(
          { gap: 1, padding: 1 },
          fixed(new Text(`Assign a role to ${options.user.label}`), 1),
          fixed(
            row(
              { gap: 1 },
              fixed(new Label('Application', applicationChoice), 14),
              grow(applicationChoice),
            ),
            1,
          ),
          fixed(row({ gap: 1 }, fixed(new Label('Role', roleChoice), 14), grow(roleChoice)), 1),
          grow(
            new Text(
              projection.applications.length === 0
                ? 'No applications are available.'
                : selectedApplicationId && projection.availableRoles.length === 0
                  ? 'No unassigned roles are available.'
                  : 'Select one application and one unassigned role.',
            ),
          ),
          fixed(row({ gap: 1 }, spacer(), assign, cancel), 2),
        ),
      ),
    );
    currentFocus = applicationChoice;
  };

  /** Shows one explicit confirmation before removing a direct assignment. */
  const renderConfirmation = (role: AdminAssignedUserRole): void => {
    const keep = new Button('Keep', {
      onClick: () => {
        confirming = undefined;
        render();
      },
    });
    const remove = new Button(`Remove ${role.name}`, {
      onClick: () => {
        confirming = undefined;
        options.onIntent({ kind: 'remove', roleId: role.id });
        render();
      },
    });
    content.add(
      cover(
        col(
          { gap: 1, padding: 1 },
          fixed(new Text('Are you sure?'), 1),
          fixed(new Text(`Role: ${role.name}`), 1),
          grow(new Text('This removes the role assignment from the selected user.')),
          fixed(row({ gap: 1 }, spacer(), keep, remove), 2),
        ),
      ),
    );
    currentFocus = keep;
  };

  /** Rebuilds the bounded dialog from one immutable state snapshot. */
  const render = (): void => {
    if (disposed) return;
    clearChildren();
    const projection = retainedProjection(state);
    if (confirming) {
      renderConfirmation(confirming);
    } else if (adding && projection) {
      renderAdd(projection);
    } else {
      adding = false;
      renderAssignments(projection);
    }
  };

  render();
  return {
    content,
    setState(next) {
      if (disposed) return;
      state = next;
      render();
    },
    focusCurrent() {
      if (currentFocus) options.focusView?.(currentFocus);
    },
    clear() {
      if (disposed) return;
      state = { kind: 'closed' };
      adding = false;
      confirming = undefined;
      selectedApplicationId = undefined;
      render();
    },
    dispose() {
      if (disposed) return;
      clearChildren();
      disposeSort();
      disposeApplicationChoice();
      disposed = true;
    },
  };
}
