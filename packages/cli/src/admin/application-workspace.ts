/** Direct JSVision workspace for deployment-global applications and modules. */

import {
  Button,
  col,
  cover,
  DataGrid,
  fixed,
  Group,
  grow,
  row,
  signal,
  spacer,
  Text,
  View,
} from '@jsvision/ui';
import type { Column, Signal } from '@jsvision/ui';

import type { AdminCapabilities } from './state.js';
import type {
  AdminApplication,
  AdminApplicationModule,
  AdminApplicationProjection,
  AdminApplicationViewState,
} from './application-state.js';

/** Closed set of application actions emitted by the global workspace. */
export type AdminApplicationIntent =
  | { readonly kind: 'create' }
  | { readonly kind: 'select'; readonly applicationId: string }
  | { readonly kind: 'retry' }
  | { readonly kind: 'back' }
  | { readonly kind: 'edit'; readonly applicationId: string }
  | { readonly kind: 'activate'; readonly applicationId: string }
  | { readonly kind: 'deactivate'; readonly applicationId: string }
  | { readonly kind: 'archive'; readonly applicationId: string }
  | { readonly kind: 'add-module'; readonly applicationId: string }
  | {
      readonly kind: 'edit-module';
      readonly applicationId: string;
      readonly moduleId: string;
    }
  | {
      readonly kind: 'deactivate-module';
      readonly applicationId: string;
      readonly moduleId: string;
    };

/** Construction inputs for the global application workspace. */
export interface AdminApplicationWorkspaceOptions {
  /** Exact capabilities from the currently verified session. */
  readonly capabilities: AdminCapabilities;
  /** Receives closed intents while controllers retain network ownership. */
  readonly onIntent: (intent: AdminApplicationIntent) => void;
  /** Focuses one mounted JSVision control through the application loop. */
  readonly focusView?: (view: View) => void;
}

/** Mounted application workspace controlled by immutable validated state. */
export interface AdminApplicationWorkspace {
  /** Content mounted inside the administration shell. */
  readonly content: View;
  /** Replaces the complete validated view state. */
  readonly setState: (state: AdminApplicationViewState) => void;
  /** Restores focus to the current primary control. */
  readonly focusCurrent: () => void;
  /** Removes retained application state and controls. */
  readonly clear: () => void;
  /** Permanently disposes the workspace. */
  readonly dispose: () => void;
}

/** Fixed safe labels for application-operation failures. */
const FAILURE_LABELS = {
  validation: 'Validation failed',
  unauthorized: 'Not authorized',
  conflict: 'Conflict',
  unavailable: 'Service unavailable',
  'invalid-response': 'Invalid server response',
} as const;

/** Columns in the complete deployment-global application catalog. */
const APPLICATION_COLUMNS: Column<AdminApplication>[] = [
  { title: 'Name', accessor: (application) => application.name, width: '2fr', minWidth: 16 },
  { title: 'Slug', accessor: (application) => application.slug, width: '1fr', minWidth: 12 },
  { title: 'Status', accessor: (application) => application.status, width: 10 },
];

/** Columns in one application's same-parent module catalog. */
const MODULE_COLUMNS: Column<AdminApplicationModule>[] = [
  { title: 'Name', accessor: (module) => module.name, width: '2fr', minWidth: 14 },
  { title: 'Slug', accessor: (module) => module.slug, width: '1fr', minWidth: 10 },
  { title: 'Status', accessor: (module) => module.status, width: 10 },
];

/** Optional operation status retained alongside a safe workspace projection. */
interface ProjectionStatus {
  /** Fixed status text safe for terminal rendering. */
  readonly label: string;
  /** Whether the status offers deliberate authoritative reconciliation. */
  readonly retry: boolean;
}

/** Creates a feature-specific application workspace using only JSVision layout primitives. */
export function createAdminApplicationWorkspace(
  options: AdminApplicationWorkspaceOptions,
): AdminApplicationWorkspace {
  const content = new Group();
  let state: AdminApplicationViewState = { kind: 'closed' };
  let currentFocus: View | null = null;
  let disposed = false;
  let focusedApplicationId: string | null = null;

  /** Builds a bounded action button without giving it vertical flex growth. */
  const action = (
    label: string,
    intent: AdminApplicationIntent,
    width: number,
    disabled: boolean | (() => boolean) = false,
  ): Button =>
    fixed(
      new Button(label, {
        disabled,
        onClick: () => options.onIntent(intent),
      }),
      width,
    );

  /** Renders the complete application catalog or its explicit empty state. */
  const renderList = (
    projection: Extract<AdminApplicationProjection, { kind: 'list' }>,
    status?: ProjectionStatus,
  ): void => {
    const createAllowed = options.capabilities.canCreateApplications;
    const header = row(
      { gap: 1 },
      fixed(new Text('Deployment-global applications'), 30),
      spacer(),
      fixed(
        new Button('~C~reate', {
          disabled: !createAllowed,
          onClick: () => options.onIntent({ kind: 'create' }),
        }),
        11,
      ),
    );
    let body: View;
    if (projection.applications.length === 0) {
      body = new Text('No applications');
      currentFocus = createAllowed ? header.children.at(-1) ?? null : null;
    } else {
      const rows: Signal<AdminApplication[]> = signal([...projection.applications]);
      const focused = signal(
        Math.max(
          0,
          projection.applications.findIndex((item) => item.id === focusedApplicationId),
        ),
      );
      const grid = new DataGrid({
        rows,
        columns: APPLICATION_COLUMNS,
        focused,
        zebra: true,
        onSelect: (_index, selected) => {
          focusedApplicationId = selected.id;
          options.onIntent({ kind: 'select', applicationId: selected.id });
        },
      });
      body = grid;
      currentFocus = grid.rows;
    }
    const denial = createAllowed ? undefined : 'Create (requires application create)';
    const retry = status?.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(header, 2),
          status &&
            fixed(
              row(
                { gap: 1 },
                grow(new Text(status.label)),
                retry && fixed(retry, 10),
              ),
              2,
            ),
          denial && fixed(new Text(denial), 1),
          grow(body),
        ),
      ),
    );
    if (retry) currentFocus = retry;
  };

  /** Renders selected application metadata, lifecycle controls, and its module grid. */
  const renderDetail = (
    projection: Extract<AdminApplicationProjection, { kind: 'detail' }>,
    status?: ProjectionStatus,
  ): void => {
    const selected = projection.application;
    const archived = selected.status === 'archived';
    const canUpdate = options.capabilities.canUpdateApplications && !archived;
    const canArchive = options.capabilities.canArchiveApplications && !archived;
    const selectedModuleId = signal<string | null>(projection.modules[0]?.id ?? null);
    const lifecycle =
      selected.status === 'inactive'
        ? action('~A~ctivate', { kind: 'activate', applicationId: selected.id }, 12, !canUpdate)
        : action('~D~eactivate', { kind: 'deactivate', applicationId: selected.id }, 14, !canUpdate);
    const actions = row(
      { gap: 1 },
      action('~B~ack', { kind: 'back' }, 9),
      action('~E~dit', { kind: 'edit', applicationId: selected.id }, 9, !canUpdate),
      lifecycle,
      action('A~r~chive', { kind: 'archive', applicationId: selected.id }, 11, !canArchive),
      spacer(),
      action(
        'Add ~m~odule',
        { kind: 'add-module', applicationId: selected.id },
        14,
        !canUpdate,
      ),
    );
    const detail = new Text(
      [
        'Deployment-global application — changes may affect multiple organizations',
        `Name: ${selected.name}`,
        `Slug: ${selected.slug}`,
        `Status: ${selected.status}`,
        `Description: ${selected.description ?? 'Not provided'}`,
        `Created: ${selected.createdAt}`,
        `Updated: ${selected.updatedAt}`,
      ].join('\n'),
    );
    const moduleAction = (
      label: string,
      kind: 'edit-module' | 'deactivate-module',
      width: number,
    ): Button =>
      fixed(
        new Button(label, {
          disabled: () => {
            const moduleId = selectedModuleId();
            const module = projection.modules.find((item) => item.id === moduleId);
            return !canUpdate || !module || (kind === 'deactivate-module' && module.status !== 'active');
          },
          onClick: () => {
            const moduleId = selectedModuleId.peek();
            if (!moduleId || !canUpdate) return;
            options.onIntent({ kind, applicationId: selected.id, moduleId });
          },
        }),
        width,
      );
    const moduleActions = row(
      { gap: 1 },
      moduleAction('~E~dit module', 'edit-module', 14),
      moduleAction('Deactivate module', 'deactivate-module', 20),
      spacer(),
    );
    let modules: View;
    if (projection.modules.length === 0) {
      modules = new Text('No modules');
      currentFocus = actions.children[0] ?? null;
    } else {
      const rows: Signal<AdminApplicationModule[]> = signal([...projection.modules]);
      const grid = new DataGrid({
        rows,
        columns: MODULE_COLUMNS,
        zebra: true,
        onSelect: (_index, module) => {
          selectedModuleId.set(module.id);
          if (canUpdate) {
            options.onIntent({
              kind: 'edit-module',
              applicationId: selected.id,
              moduleId: module.id,
            });
          }
        },
      });
      modules = grid;
      currentFocus = grid.rows;
    }
    const denials = [
      !options.capabilities.canUpdateApplications
        ? 'Edit, lifecycle, and module actions require application update'
        : undefined,
      !options.capabilities.canArchiveApplications
        ? 'Archive requires application archive'
        : undefined,
    ].filter((value): value is string => Boolean(value));
    const retry = status?.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    content.add(
      cover(
        col(
          { gap: 0, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(detail, 7),
          status &&
            fixed(
              row(
                { gap: 1 },
                grow(new Text(status.label)),
                retry && fixed(retry, 10),
              ),
              2,
            ),
          archived && fixed(new Text('Archived applications are read only'), 1),
          ...denials.map((denial) => fixed(new Text(denial), 1)),
          fixed(actions, 2),
          fixed(new Text('Modules'), 1),
          grow(modules),
          fixed(moduleActions, 2),
        ),
      ),
    );
    if (retry) currentFocus = retry;
  };

  /** Rebuilds feature content so removed states cannot leave terminal artifacts. */
  const render = (): void => {
    for (const child of [...content.children]) content.remove(child);
    currentFocus = null;
    if (disposed || state.kind === 'closed') return;
    if (state.kind === 'list') {
      renderList({ ...state });
      return;
    }
    if (state.kind === 'detail') {
      renderDetail({ ...state });
      return;
    }
    const label =
      state.kind === 'loading'
        ? 'Loading applications…'
        : state.kind === 'indeterminate'
          ? 'The operation outcome is unknown; reload is required'
          : FAILURE_LABELS[state.failure];
    if (state.previous) {
      const status = { label, retry: state.kind !== 'loading' };
      if (state.previous.kind === 'list') renderList(state.previous, status);
      else renderDetail(state.previous, status);
      return;
    }
    const retry = new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) });
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(new Text('Deployment-global applications'), 1),
          fixed(new Text(label), 1),
          state.kind !== 'loading' && fixed(retry, 10),
          spacer(),
        ),
      ),
    );
    if (state.kind !== 'loading') currentFocus = retry;
  };

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
      focusedApplicationId = null;
      render();
    },
    dispose() {
      if (disposed) return;
      state = { kind: 'closed' };
      focusedApplicationId = null;
      render();
      disposed = true;
    },
  };
}
