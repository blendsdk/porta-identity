/** Direct DataGrid pages for Application role and permission administration. */

import {
  Button,
  col,
  createRoot,
  DataGrid,
  effect,
  fixed,
  Group,
  grow,
  row,
  signal,
  sortRows,
  spacer,
  Text,
} from '@jsvision/ui';
import type { Column, Signal, SortState, View } from '@jsvision/ui';

import { formatAdminDateTime } from './admin-date-time.js';
import type { AdminApplication, AdminApplicationModule } from './application-state.js';
import type { AdminApplicationRbacViewState, AdminPermission, AdminRole } from './rbac-state.js';
import type { AdminCapabilities } from './state.js';

/** Closed set of role and permission intents emitted by the two Application pages. */
export type AdminApplicationRbacIntent =
  | { readonly kind: 'add-role' }
  | { readonly kind: 'edit-role'; readonly roleId: string }
  | { readonly kind: 'delete-role'; readonly roleId: string }
  | { readonly kind: 'manage-role-permissions'; readonly roleId: string }
  | { readonly kind: 'add-permission' }
  | { readonly kind: 'edit-permission'; readonly permissionId: string }
  | { readonly kind: 'delete-permission'; readonly permissionId: string }
  | { readonly kind: 'reload' };

/** Construction inputs for the two Application RBAC pages. */
export interface AdminApplicationRbacWorkspaceOptions {
  /** Selected immutable Application owner. */
  readonly application: AdminApplication;
  /** Complete module catalog used to render permission scope. */
  readonly modules: readonly AdminApplicationModule[];
  /** Exact capabilities from the current verified session. */
  readonly capabilities: AdminCapabilities;
  /** Receives one explicit user intent. */
  readonly onIntent: (intent: AdminApplicationRbacIntent) => void;
  /** Restores keyboard focus after the parent mounts or repaints a page. */
  readonly focusView?: (view: View) => void;
}

/** Mounted pair of Application RBAC pages. */
export interface AdminApplicationRbacWorkspace {
  /** Direct Roles tab content. */
  readonly roles: Group;
  /** Direct Permissions tab content. */
  readonly permissions: Group;
  /** Replaces both pages from one immutable controller state. */
  readonly setState: (state: AdminApplicationRbacViewState) => void;
  /** Focuses the most relevant control on the active page. */
  readonly focusCurrent: (page: 'roles' | 'permissions') => void;
  /** Clears both pages without disposing their owner. */
  readonly clear: () => void;
  /** Releases retained rows and prevents later publication. */
  readonly dispose: () => void;
}

const ROLE_COLUMNS: Column<AdminRole>[] = [
  { title: 'Name', accessor: (role) => role.name, width: '1fr', minWidth: 18 },
  { title: 'Slug', accessor: (role) => role.slug, width: '1fr', minWidth: 18 },
  {
    title: 'Description',
    accessor: (role) => role.description ?? '',
    width: '1fr',
    minWidth: 20,
  },
  { title: 'Created', accessor: (role) => formatAdminDateTime(role.createdAt), width: 18 },
  { title: 'Updated', accessor: (role) => formatAdminDateTime(role.updatedAt), width: 18 },
];

/** Returns columns whose scope accessor resolves through the selected Application modules. */
function permissionColumns(modules: readonly AdminApplicationModule[]): Column<AdminPermission>[] {
  const moduleNames = new Map(modules.map((module) => [module.id, module.name]));
  return [
    { title: 'Name', accessor: (permission) => permission.name, width: '1fr', minWidth: 18 },
    { title: 'Slug', accessor: (permission) => permission.slug, width: '1fr', minWidth: 20 },
    {
      title: 'Scope',
      accessor: (permission) =>
        permission.moduleId
          ? (moduleNames.get(permission.moduleId) ?? permission.moduleId)
          : 'Application',
      width: 18,
    },
    {
      title: 'Created',
      accessor: (permission) => formatAdminDateTime(permission.createdAt),
      width: 18,
    },
    {
      title: 'Description',
      accessor: (permission) => permission.description ?? '',
      width: '1fr',
      minWidth: 20,
    },
  ];
}

/** Fixed canonical role slugs seeded in the Porta Admin Application. */
const CANONICAL_ROLE_SLUGS = new Set([
  'porta-admin',
  'porta-super-admin',
  'porta-org-admin',
  'porta-user-admin',
  'porta-app-admin',
  'porta-auditor',
]);

/** Exact built-in permission slugs seeded in the canonical Porta Admin Application. */
const CANONICAL_PERMISSION_SLUGS = new Set([
  'admin:org:create',
  'admin:org:read',
  'admin:org:update',
  'admin:org:suspend',
  'admin:org:delete',
  'admin:app:create',
  'admin:app:read',
  'admin:app:update',
  'admin:app:delete',
  'admin:module:delete',
  'admin:client:create',
  'admin:client:read',
  'admin:client:update',
  'admin:client:revoke',
  'admin:client:delete',
  'admin:user:create',
  'admin:user:read',
  'admin:user:update',
  'admin:user:lifecycle',
  'admin:user:delete',
  'admin:user:invite',
  'admin:user:2fa',
  'admin:role:create',
  'admin:role:read',
  'admin:role:update',
  'admin:role:delete',
  'admin:role:assign',
  'admin:permission:create',
  'admin:permission:read',
  'admin:permission:update',
  'admin:permission:delete',
  'admin:claim:create',
  'admin:claim:read',
  'admin:claim:update',
  'admin:claim:delete',
  'admin:config:read',
  'admin:config:update',
  'admin:key:read',
  'admin:key:generate',
  'admin:key:rotate',
  'admin:audit:read',
  'admin:session:read',
  'admin:session:revoke',
  'admin:stats:read',
  'admin:export:read',
  'admin:import:write',
]);

/** Fixed safe labels for RBAC operation failures. */
const FAILURE_LABELS = {
  validation: 'Validation failed',
  unauthorized: 'Not authorized',
  conflict: 'Conflict',
  unavailable: 'Service unavailable',
  'invalid-response': 'Invalid server response',
} as const;

/** Returns whether a role is one of the immutable built-ins in the canonical Application. */
function isCanonicalRole(application: AdminApplication, role: AdminRole | undefined): boolean {
  return (
    application.slug === 'porta-admin' && role !== undefined && CANONICAL_ROLE_SLUGS.has(role.slug)
  );
}

/** Returns whether a permission is one of the immutable built-ins in the canonical Application. */
function isCanonicalPermission(
  application: AdminApplication,
  permission: AdminPermission | undefined,
): boolean {
  return (
    application.slug === 'porta-admin' &&
    permission !== undefined &&
    CANONICAL_PERMISSION_SLUGS.has(permission.slug)
  );
}

/** Returns the last complete validated collection retained by the controller state. */
function retainedProjection(
  state: AdminApplicationRbacViewState,
): Extract<AdminApplicationRbacViewState, { readonly kind: 'ready' }> | undefined {
  if (state.kind === 'ready') return state;
  if (state.kind === 'loading' || state.kind === 'failure' || state.kind === 'indeterminate') {
    return state.previous;
  }
  return undefined;
}

/** Returns the fixed status text that explains non-authoritative RBAC rows. */
function stateNotice(state: AdminApplicationRbacViewState): string | undefined {
  if (state.kind === 'loading') return 'Loading roles and permissions…';
  if (state.kind === 'indeterminate') {
    return 'The operation outcome is unknown; reload is required';
  }
  return state.kind === 'failure' ? FAILURE_LABELS[state.failure] : undefined;
}

/** Clears positional selection whenever a DataGrid changes its display order. */
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

/** Creates both direct RBAC pages without introducing a reusable CRUD framework. */
export function createAdminApplicationRbacWorkspace(
  options: AdminApplicationRbacWorkspaceOptions,
): AdminApplicationRbacWorkspace {
  const roles = new Group();
  const permissions = new Group();
  let state: AdminApplicationRbacViewState = { kind: 'closed' };
  let roleRows: Signal<AdminRole[]> = signal([]);
  let permissionRows: Signal<AdminPermission[]> = signal([]);
  let selectedRoleIndex = signal(-1);
  let selectedPermissionIndex = signal(-1);
  let roleSort = signal<SortState>(null);
  let permissionSort = signal<SortState>(null);
  let roleFocus: View | undefined;
  let permissionFocus: View | undefined;
  let disposeRoleSort = (): void => undefined;
  let disposePermissionSort = (): void => undefined;
  let disposed = false;

  /** Prevents mutations while an authoritative read or reconciliation owns the view. */
  const mutationsBlocked = (): boolean =>
    state.kind === 'loading' || state.kind === 'indeterminate';

  /** Resolves the explicit selected role after the current sort is applied. */
  const selectedRole = (): AdminRole | undefined =>
    sortRows(roleRows(), ROLE_COLUMNS, roleSort())[selectedRoleIndex()];

  const columns = permissionColumns(options.modules);

  /** Resolves the explicit selected permission after the current sort is applied. */
  const selectedPermission = (): AdminPermission | undefined =>
    sortRows(permissionRows(), columns, permissionSort())[selectedPermissionIndex()];

  /** Replaces one page's children so stale rows never remain visible. */
  const replace = (page: Group, content: View): void => {
    for (const child of [...page.children]) page.remove(child);
    page.add(content);
  };

  /** Builds the Roles DataGrid and its exact action row. */
  const renderRoles = (): void => {
    disposeRoleSort();
    const projection = retainedProjection(state);
    roleRows = signal([...(projection?.roles ?? [])]);
    selectedRoleIndex = signal(-1);
    roleSort = signal<SortState>(null);
    disposeRoleSort = clearSelectionOnSort(roleSort, selectedRoleIndex);
    const grid = new DataGrid<AdminRole>({
      rows: roleRows,
      columns: ROLE_COLUMNS,
      selected: selectedRoleIndex,
      sort: roleSort,
      zebra: true,
    });
    const add = new Button('Add', {
      disabled: () => mutationsBlocked() || !options.capabilities.canCreateRoles,
      onClick: () => options.onIntent({ kind: 'add-role' }),
    });
    const edit = new Button('Edit', {
      disabled: () =>
        mutationsBlocked() ||
        !options.capabilities.canUpdateRoles ||
        !selectedRole() ||
        isCanonicalRole(options.application, selectedRole()),
      onClick: () => {
        const target = selectedRole();
        if (target) options.onIntent({ kind: 'edit-role', roleId: target.id });
      },
    });
    const remove = new Button('Delete', {
      disabled: () =>
        mutationsBlocked() ||
        !options.capabilities.canDeleteRoles ||
        !selectedRole() ||
        isCanonicalRole(options.application, selectedRole()),
      onClick: () => {
        const target = selectedRole();
        if (target) options.onIntent({ kind: 'delete-role', roleId: target.id });
      },
    });
    const manage = new Button('Manage permissions', {
      disabled: () =>
        mutationsBlocked() ||
        !options.capabilities.canUpdateRoles ||
        !options.capabilities.canReadPermissions ||
        !selectedRole() ||
        isCanonicalRole(options.application, selectedRole()),
      onClick: () => {
        const target = selectedRole();
        if (target) options.onIntent({ kind: 'manage-role-permissions', roleId: target.id });
      },
    });
    const reload = new Button('Reload', {
      onClick: () => options.onIntent({ kind: 'reload' }),
    });
    const notices = [
      stateNotice(state),
      !options.capabilities.canCreateRoles ? 'Role create permission required.' : undefined,
      options.application.slug === 'porta-admin'
        ? 'This built-in Porta Admin record cannot be changed.'
        : undefined,
    ].filter((value): value is string => value !== undefined);
    const actionRow = row({ gap: 1 }, add, edit, remove, manage, spacer(), reload);
    replace(
      roles,
      col(
        { gap: 1, padding: 1 },
        fixed(new Text(`Application: ${options.application.name}`), 1),
        ...notices.map((notice) => fixed(new Text(notice), 1)),
        grow(grid),
        fixed(actionRow, 2),
      ),
    );
    roleFocus = grid.rows;
  };

  /** Builds the Permissions DataGrid and its exact action row. */
  const renderPermissions = (): void => {
    disposePermissionSort();
    const projection = retainedProjection(state);
    permissionRows = signal([...(projection?.permissions ?? [])]);
    selectedPermissionIndex = signal(-1);
    permissionSort = signal<SortState>(null);
    disposePermissionSort = clearSelectionOnSort(permissionSort, selectedPermissionIndex);
    const grid = new DataGrid<AdminPermission>({
      rows: permissionRows,
      columns,
      selected: selectedPermissionIndex,
      sort: permissionSort,
      zebra: true,
    });
    const add = new Button('Add', {
      disabled: () => mutationsBlocked() || !options.capabilities.canCreatePermissions,
      onClick: () => options.onIntent({ kind: 'add-permission' }),
    });
    const edit = new Button('Edit', {
      disabled: () =>
        mutationsBlocked() ||
        !options.capabilities.canUpdatePermissions ||
        !selectedPermission() ||
        isCanonicalPermission(options.application, selectedPermission()),
      onClick: () => {
        const target = selectedPermission();
        if (target) options.onIntent({ kind: 'edit-permission', permissionId: target.id });
      },
    });
    const remove = new Button('Delete', {
      disabled: () =>
        mutationsBlocked() ||
        !options.capabilities.canDeletePermissions ||
        !selectedPermission() ||
        isCanonicalPermission(options.application, selectedPermission()),
      onClick: () => {
        const target = selectedPermission();
        if (target) options.onIntent({ kind: 'delete-permission', permissionId: target.id });
      },
    });
    const reload = new Button('Reload', {
      onClick: () => options.onIntent({ kind: 'reload' }),
    });
    const notices = [
      stateNotice(state),
      !options.capabilities.canCreatePermissions
        ? 'Permission create permission required.'
        : undefined,
      options.application.slug === 'porta-admin'
        ? 'This built-in Porta Admin record cannot be changed.'
        : undefined,
    ].filter((value): value is string => value !== undefined);
    const actionRow = row({ gap: 1 }, add, edit, remove, spacer(), reload);
    replace(
      permissions,
      col(
        { gap: 1, padding: 1 },
        fixed(new Text(`Application: ${options.application.name}`), 1),
        ...notices.map((notice) => fixed(new Text(notice), 1)),
        grow(grid),
        fixed(actionRow, 2),
      ),
    );
    permissionFocus = grid.rows;
  };

  /** Repaints both pages from one immutable state snapshot. */
  const render = (): void => {
    if (disposed) return;
    renderRoles();
    renderPermissions();
  };

  render();
  return {
    roles,
    permissions,
    setState(next) {
      if (disposed) return;
      state = next;
      render();
    },
    focusCurrent(page) {
      const target = page === 'roles' ? roleFocus : permissionFocus;
      if (target) options.focusView?.(target);
    },
    clear() {
      if (disposed) return;
      state = { kind: 'closed' };
      render();
    },
    dispose() {
      if (disposed) return;
      state = { kind: 'closed' };
      render();
      disposeRoleSort();
      disposePermissionSort();
      disposed = true;
    },
  };
}
