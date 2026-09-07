/** Direct JSVision workspace for deployment-global applications and modules. */

import {
  Button,
  col,
  cover,
  DataGrid,
  Dialog,
  fixed,
  GroupBox,
  grow,
  row,
  Show,
  signal,
  sortRows,
  spacer,
  Text,
  View,
} from '@jsvision/ui';
import type { Column, Signal, SortState } from '@jsvision/ui';

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
  | { readonly kind: 'delete'; readonly applicationId: string }
  | { readonly kind: 'add-module'; readonly applicationId: string }
  | {
      readonly kind: 'edit-module';
      readonly applicationId: string;
      readonly moduleId: string;
    }
  | {
      readonly kind: 'activate-module';
      readonly applicationId: string;
      readonly moduleId: string;
    }
  | {
      readonly kind: 'deactivate-module';
      readonly applicationId: string;
      readonly moduleId: string;
    }
  | {
      readonly kind: 'delete-module';
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
  const content = new Dialog({ title: 'Applications', width: 72, height: 20 });
  content.closable = false;
  content.resizable = false;
  content.zoomable = false;
  let state: AdminApplicationViewState = { kind: 'closed' };
  let currentFocus: View | null = null;
  let disposed = false;
  let focusedApplicationId: string | null = null;

  /** Builds an action button whose natural size is resolved by its Layout DSL row. */
  const action = (
    label: string,
    intent: AdminApplicationIntent,
    disabled: boolean | (() => boolean) = false,
  ): Button =>
    new Button(label, {
      disabled,
      onClick: () => options.onIntent(intent),
    });

  /** Renders the complete application catalog or its explicit empty state. */
  const renderList = (
    projection: Extract<AdminApplicationProjection, { kind: 'list' }>,
    status?: ProjectionStatus,
  ): void => {
    const createAllowed = options.capabilities.canCreateApplications;
    let body: View;
    if (projection.applications.length === 0) {
      body = new Text(
        createAllowed
          ? 'No applications. Use Applications > Create application.'
          : 'No applications',
      );
      currentFocus = null;
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
    const applicationCount = projection.applications.length;
    const retry = status?.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          status && fixed(row({ gap: 1 }, grow(new Text(status.label)), retry), 2),
          grow(body),
          projection.applications.length > 0 &&
            fixed(
              new Text(
                `↑↓ Move · Enter View details · ${applicationCount} ${applicationCount === 1 ? 'application' : 'applications'}`,
              ),
              1,
            ),
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
    const canUpdate = options.capabilities.canUpdateApplications;
    const canDelete = options.capabilities.canDeleteApplications;
    const lifecycle =
      selected.status === 'inactive'
        ? action('~A~ctivate', { kind: 'activate', applicationId: selected.id }, !canUpdate)
        : action('~D~eactivate', { kind: 'deactivate', applicationId: selected.id }, !canUpdate);
    const applicationActions = row(
      { gap: 1 },
      spacer(),
      action('~E~dit', { kind: 'edit', applicationId: selected.id }, !canUpdate),
      lifecycle,
      action('Delete', { kind: 'delete', applicationId: selected.id }, !canDelete),
    );
    const detail = col(
      fixed(
        row(
          { gap: 1 },
          grow(new Text(selected.name)),
          fixed(new Text(selected.status.toUpperCase()), 10),
        ),
        1,
      ),
      fixed(new Text(`Slug: ${selected.slug}`), 1),
      fixed(new Text(selected.description ?? 'No description'), 1),
      fixed(
        row(
          { gap: 2 },
          grow(new Text(`Created: ${selected.createdAt}`)),
          grow(new Text(`Updated: ${selected.updatedAt}`)),
        ),
        1,
      ),
    );
    const moduleRows: Signal<AdminApplicationModule[]> = signal([...projection.modules]);
    const selectedModuleIndex = signal(-1);
    const moduleSort = signal<SortState>(null);

    /** Resolves the selected display row after the DataGrid applies its current sort. */
    const selectedModule = (): AdminApplicationModule | undefined =>
      sortRows(moduleRows(), MODULE_COLUMNS, moduleSort())[selectedModuleIndex()];

    const moduleAction = (
      label: string,
      kind: 'edit-module' | 'activate-module' | 'deactivate-module' | 'delete-module',
    ): Button =>
      new Button(label, {
        disabled: () => {
          const module = selectedModule();
          return (
            !module ||
            (kind === 'delete-module'
              ? !options.capabilities.canDeleteModules
              : !canUpdate ||
                (kind === 'activate-module' && module.status !== 'inactive') ||
                (kind === 'deactivate-module' && module.status !== 'active'))
          );
        },
        onClick: () => {
          const module = selectedModule();
          if (
            !module ||
            (kind === 'delete-module' ? !options.capabilities.canDeleteModules : !canUpdate)
          )
            return;
          options.onIntent({ kind, applicationId: selected.id, moduleId: module.id });
        },
      });
    const addModule = action(
      'Add ~m~odule',
      { kind: 'add-module', applicationId: selected.id },
      !canUpdate,
    );
    const moduleLifecycle = row();
    moduleLifecycle.addDynamic(() =>
      Show(
        () => selectedModule()?.status === 'inactive',
        () => moduleAction('~A~ctivate module', 'activate-module'),
        () => moduleAction('Deacti~v~ate module', 'deactivate-module'),
      ),
    );
    const moduleActions = row(
      { gap: 1 },
      spacer(),
      addModule,
      moduleAction('~E~dit module', 'edit-module'),
      moduleLifecycle,
      moduleAction('Delete module', 'delete-module'),
    );
    const back = action('~B~ack to applications', { kind: 'back' });
    let modules: View;
    if (projection.modules.length === 0) {
      modules = new Text('No modules');
      currentFocus = canUpdate ? addModule : back;
    } else {
      const grid = new DataGrid({
        rows: moduleRows,
        columns: MODULE_COLUMNS,
        selected: selectedModuleIndex,
        sort: moduleSort,
        zebra: true,
      });
      modules = grid;
      currentFocus = grid.rows;
    }
    const denials = [
      !options.capabilities.canUpdateApplications
        ? 'Edit, lifecycle, and module actions require application update'
        : undefined,
      !options.capabilities.canDeleteApplications
        ? 'Delete requires application delete'
        : undefined,
      !options.capabilities.canDeleteModules ? 'Module Delete requires module delete' : undefined,
    ].filter((value): value is string => Boolean(value));
    const retry = status?.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    const applicationNotices = denials;
    const applicationSection = new GroupBox({ title: 'Application' });
    applicationSection.add(
      cover(
        col(
          { gap: 0 },
          fixed(detail, 4),
          ...applicationNotices.map((notice) => fixed(new Text(notice), 1)),
          fixed(applicationActions, 2),
        ),
      ),
    );
    const moduleCount = projection.modules.length;
    const modulesSection = new GroupBox({
      title: `Modules · ${moduleCount} ${moduleCount === 1 ? 'module' : 'modules'}`,
    });
    modulesSection.add(cover(col({ gap: 1 }, grow(modules), fixed(moduleActions, 2))));
    content.add(
      cover(
        col(
          { gap: 0, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          status && fixed(row({ gap: 1 }, grow(new Text(status.label)), retry), 2),
          fixed(applicationSection, 8 + applicationNotices.length),
          grow(modulesSection),
          fixed(row({ gap: 1 }, back, spacer()), 2),
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
    const retry = new Button('~R~etry', {
      onClick: () => options.onIntent({ kind: 'retry' }),
    });
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(new Text('Applications'), 1),
          fixed(new Text(label), 1),
          state.kind !== 'loading' && row(retry, spacer()),
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
