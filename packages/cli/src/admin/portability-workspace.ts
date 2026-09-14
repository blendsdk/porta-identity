/** Maximized Layout DSL workspace for selective manifest export and import. */

import {
  Button,
  CheckGroup,
  col,
  cover,
  Dialog,
  fixed,
  Group,
  grow,
  RadioGroup,
  row,
  signal,
  spacer,
  TabView,
  Text,
} from '@jsvision/ui';
import type { Signal, Tab, View } from '@jsvision/ui';
import type {
  ExportManifestRequest,
  PortabilityCategory,
  PortabilityEntityType,
  PortabilityResultBase,
  PortabilityResultError,
  PortabilityScope,
} from '@portaidentity/sdk';

import type {
  AdminPortabilityApplicationSelection,
  AdminPortabilityExportSelection,
  AdminPortabilityImportMode,
  AdminPortabilityIntent,
  AdminPortabilityWorkspaceState,
} from './portability-state.js';
import { SelectableReadOnlyInput } from './selectable-read-only-input.js';

/** Capability subset needed to render and gate one portability workspace. */
export interface AdminPortabilityCapabilities {
  /** Whether manifest export may be requested. */
  readonly canExportData: boolean;
  /** Whether manifest import may be requested. */
  readonly canImportData: boolean;
  /** Whether complete-environment scope may be offered. */
  readonly isSuperAdmin: boolean;
  /** Whether organization data may be exported. */
  readonly canReadOrganizations: boolean;
  /** Whether global applications may be exported. */
  readonly canReadApplications: boolean;
  /** Whether application roles may be exported. */
  readonly canReadRoles: boolean;
  /** Whether application permissions may be exported. */
  readonly canReadPermissions: boolean;
  /** Whether application claims may be exported. */
  readonly canReadClaims: boolean;
  /** Whether organization users may be exported. */
  readonly canReadUsers: boolean;
  /** Whether organization OIDC clients may be exported. */
  readonly canReadClients: boolean;
}

/** Safe selected-organization details used only for scope presentation. */
export interface AdminPortabilityOrganization {
  /** Stable organization identifier. */
  readonly id: string;
  /** Organization display name. */
  readonly name: string;
  /** Organization natural key used by the manifest. */
  readonly slug: string;
  /** Current organization lifecycle state. */
  readonly status: 'active' | 'suspended';
}

/** Safe global application choice shown by application-related exports. */
export interface AdminPortabilityApplication {
  /** Stable application identifier. */
  readonly id: string;
  /** Application display name. */
  readonly name: string;
  /** Application natural key used by the manifest. */
  readonly slug: string;
}

/** Construction values for one terminal portability workspace. */
export interface AdminPortabilityWorkspaceOptions {
  /** Explicit capabilities derived from the current verified session. */
  readonly capabilities: AdminPortabilityCapabilities;
  /** Selected organization, when the shell currently owns one. */
  readonly organization?: AdminPortabilityOrganization;
  /** Global applications available for explicit selection. */
  readonly applications: readonly AdminPortabilityApplication[];
  /** Receives closed user intents while the controller owns side effects. */
  readonly onIntent: (intent: AdminPortabilityIntent) => void;
  /** Focuses one mounted control through the application event loop. */
  readonly focusView?: (view: View) => void;
  /** Releases controller ownership after a direct frame close. */
  readonly onClose?: () => void;
}

/** Mounted workspace controlled only through immutable state replacement. */
export interface AdminPortabilityWorkspace {
  /** Maximized modeless window mounted into the administration desktop. */
  readonly content: Dialog;
  /** Replaces the complete rendered state. */
  readonly setState: (state: AdminPortabilityWorkspaceState) => void;
  /** Restores focus inside the currently selected tab. */
  readonly focusCurrent: () => void;
  /** Releases retained view state. */
  readonly clear: () => void;
}

/** Manifest categories in the same order used throughout the UI. */
const CATEGORIES: readonly PortabilityCategory[] = [
  'organizations',
  'applications_authorization',
  'users_assignments',
  'oidc_clients',
];

/** Human-readable labels aligned with the manifest category catalog. */
const CATEGORY_LABELS = [
  'Organizations',
  'Applications, roles, permissions, and claims',
  'Users and assignments',
  'OIDC clients',
] as const;

/** Result groups in server dependency order. */
const ENTITY_ORDER: readonly PortabilityEntityType[] = [
  'organizations',
  'applications',
  'application_modules',
  'roles',
  'permissions',
  'claim_definitions',
  'role_permission_mappings',
  'users',
  'user_role_assignments',
  'user_claim_values',
  'clients',
];

/** Display labels for result groups. */
const ENTITY_LABELS: Readonly<Record<PortabilityEntityType, string>> = {
  organizations: 'Organizations',
  applications: 'Applications',
  application_modules: 'Application modules',
  roles: 'Roles',
  permissions: 'Permissions',
  claim_definitions: 'Claim definitions',
  role_permission_mappings: 'Role permissions',
  users: 'Users',
  user_role_assignments: 'User role assignments',
  user_claim_values: 'User claim values',
  clients: 'Clients',
};

/** Modeless dialog that asks its controller to close owned work. */
class PortabilityDialog extends Dialog {
  /** Creates the fixed full-page surface. */
  constructor(private readonly closeOwnedWorkspace?: () => void) {
    super({ title: 'Import / Export', width: 72, height: 20 });
    this.resizable = false;
    this.zoomable = true;
    this.minWidth = 49;
    this.minHeight = 19;
    this.onMount(() => {
      if (!this.isZoomed()) this.zoom();
      this.zoomable = false;
    });
  }

  /** Delegates direct frame closure to the owner when one exists. */
  override close(): void {
    if (this.closeOwnedWorkspace) this.closeOwnedWorkspace();
    else super.close();
  }
}

/** Wraps one Layout DSL tree in the Group required by TabView. */
function tabPage(child: View): Group {
  const page = new Group();
  page.add(cover(child));
  return page;
}

/** Returns whether an export category is locally available. */
function canExportCategory(
  category: PortabilityCategory,
  capabilities: AdminPortabilityCapabilities,
): boolean {
  if (!capabilities.canExportData) return false;
  switch (category) {
    case 'organizations':
      return capabilities.canReadOrganizations;
    case 'applications_authorization':
      return (
        capabilities.canReadApplications &&
        capabilities.canReadRoles &&
        capabilities.canReadPermissions &&
        capabilities.canReadClaims
      );
    case 'users_assignments':
      return capabilities.canReadUsers && capabilities.canReadRoles && capabilities.canReadClaims;
    case 'oidc_clients':
      return capabilities.canReadClients && capabilities.canReadApplications;
  }
}

/** Creates the safe first export selection for the current shell context. */
function initialExportSelection(
  options: AdminPortabilityWorkspaceOptions,
): AdminPortabilityExportSelection {
  const scope: PortabilityScope | undefined = options.organization
    ? { kind: 'organization', organization_slug: options.organization.slug }
    : options.capabilities.isSuperAdmin
      ? { kind: 'environment' }
      : undefined;
  return {
    ...(scope ? { scope } : {}),
    categories: CATEGORIES.filter(
      (category) =>
        category !== 'oidc_clients' && canExportCategory(category, options.capabilities),
    ),
    applications: { kind: 'all' },
  };
}

/** Returns whether selected categories need an explicit application choice. */
function needsApplications(categories: readonly PortabilityCategory[]): boolean {
  return categories.some(
    (category) => category === 'applications_authorization' || category === 'oidc_clients',
  );
}

/** Converts a UI application choice to the exact SDK request shape. */
function applicationRequest(selection: AdminPortabilityApplicationSelection) {
  return selection.kind === 'all'
    ? { all_applications: true, application_slugs: [] }
    : { all_applications: false, application_slugs: selection.slugs };
}

/** Returns whether a complete export request can be sent. */
function validExportSelection(selection: AdminPortabilityExportSelection): boolean {
  if (!selection.scope || selection.categories.length === 0) return false;
  return !(
    needsApplications(selection.categories) &&
    selection.applications.kind === 'selected' &&
    selection.applications.slugs.length === 0
  );
}

/** Produces one compact line for a result group. */
function summaryLine(
  result: PortabilityResultBase,
  entity: PortabilityEntityType,
): string | undefined {
  const counts = result.summary[entity];
  if (!counts) return undefined;
  const total = counts.created + counts.updated + counts.skipped + counts.rejected;
  if (total === 0) return undefined;
  return `${ENTITY_LABELS[entity]}: ${counts.created} created, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.rejected} rejected`;
}

/** Formats a public natural key without retaining it outside the rendered control. */
function errorLine(error: PortabilityResultError): string {
  return `${ENTITY_LABELS[error.entity_type]}: ${Object.values(error.natural_key).join(' / ')} — ${error.code}`;
}

/** Creates the maximized two-tab portability workspace. */
export function createAdminPortabilityWorkspace(
  options: AdminPortabilityWorkspaceOptions,
): AdminPortabilityWorkspace {
  const content = new PortabilityDialog(options.onClose);
  const activeTab = signal(options.capabilities.canExportData ? 0 : 1);
  let state: AdminPortabilityWorkspaceState = {
    kind: 'ready',
    exportSelection: initialExportSelection(options),
  };
  let currentTabs: TabView | undefined;
  let tabFocus: readonly (View | null)[] = [null, null];
  let readExportSelection = (): AdminPortabilityExportSelection => initialExportSelection(options);

  /** Builds the fixed permission state used by an unauthorized tab. */
  const permissionPage = (operation: 'Export' | 'Import'): Group =>
    tabPage(col({ padding: 1, gap: 1 }, fixed(new Text(`${operation} permission required`), 1)));

  /** Builds the export controls and their compact selection summary. */
  const exportPage = (): Group => {
    if (!options.capabilities.canExportData) return permissionPage('Export');
    const ready = state.kind === 'ready' ? state : undefined;
    const selection = ready?.exportSelection ?? initialExportSelection(options);
    const scope = signal(selection.scope?.kind === 'environment' ? 1 : 0);
    const categoryValues = signal(
      CATEGORIES.map((category) => selection.categories.includes(category)),
    );
    const categories = new CheckGroup({ labels: CATEGORY_LABELS, value: categoryValues });
    CATEGORIES.forEach((category, index) => {
      categories.setItemEnabled(index, canExportCategory(category, options.capabilities));
    });
    const applicationMode = signal(selection.applications.kind === 'all' ? 0 : 1);
    const applicationModes = new RadioGroup({
      labels: ['All applications', 'Selected applications'],
      value: applicationMode,
    });
    const selectedSlugs =
      selection.applications.kind === 'selected' ? selection.applications.slugs : [];
    const applicationValues = signal(
      options.applications.map((application) => selectedSlugs.includes(application.slug)),
    );
    const applicationChoices = new CheckGroup({
      labels: options.applications.map((application) => application.name),
      value: applicationValues,
    });
    const selectedCategories = (): readonly PortabilityCategory[] =>
      CATEGORIES.filter((_, index) => categoryValues()[index] === true);
    const selectedApplications = (): AdminPortabilityApplicationSelection =>
      applicationMode() === 0
        ? { kind: 'all' }
        : {
            kind: 'selected',
            slugs: options.applications.flatMap((application, index) =>
              applicationValues()[index] ? [application.slug] : [],
            ),
          };
    const currentSelection = (): AdminPortabilityExportSelection => {
      const scopeIndex = scope();
      const selectedScope: PortabilityScope | undefined =
        scopeIndex === 1 && options.capabilities.isSuperAdmin
          ? { kind: 'environment' }
          : options.organization
            ? { kind: 'organization', organization_slug: options.organization.slug }
            : undefined;
      return {
        ...(selectedScope ? { scope: selectedScope } : {}),
        categories: selectedCategories(),
        applications: selectedApplications(),
      };
    };
    readExportSelection = currentSelection;
    const exportAction = new Button('Export…', {
      disabled: () => ready?.pending !== undefined || !validExportSelection(currentSelection()),
      onClick: () => {
        const current = currentSelection();
        if (!current.scope || !validExportSelection(current)) return;
        const request: ExportManifestRequest = {
          scope: current.scope,
          categories: current.categories,
          application_selection: applicationRequest(current.applications),
        };
        options.onIntent({ kind: 'export', request });
      },
    });
    const close = new Button('Close', { onClick: () => options.onIntent({ kind: 'close' }) });
    const scopeLabels = [
      `Selected organization${options.organization ? `: ${options.organization.name}` : ' required'}`,
      ...(options.capabilities.isSuperAdmin ? ['Entire environment'] : []),
    ];
    const scopeControl = new RadioGroup({ labels: scopeLabels, value: scope });
    const summary = new Text(() => {
      const current = currentSelection();
      return `${current.categories.length} categories · ${current.applications.kind === 'all' ? 'All applications' : `${current.applications.slugs.length} applications`}`;
    });
    const page = tabPage(
      col(
        { padding: 1, gap: 1 },
        fixed(
          row({ gap: 1 }, fixed(new Text('Scope'), 14), grow(scopeControl)),
          scopeLabels.length,
        ),
        fixed(
          row({ gap: 1 }, fixed(new Text('Categories'), 14), grow(categories)),
          CATEGORIES.length,
        ),
        fixed(
          row(
            { gap: 1 },
            fixed(new Text('Applications'), 14),
            grow(applicationModes),
            options.applications.length > 0 && grow(applicationChoices),
          ),
          Math.max(2, options.applications.length),
        ),
        fixed(summary, 1),
        spacer(),
        fixed(row({ gap: 1 }, exportAction, close, spacer()), 2),
      ),
    );
    tabFocus = [scopeControl, tabFocus[1] ?? null];
    return page;
  };

  /** Builds ordered preview/apply output without introducing a scrolling surface. */
  const resultRows = (result: PortabilityResultBase | undefined): readonly View[] => {
    if (!result) return [new Text('No preview')];
    const errors = [...result.errors].sort(
      (left, right) =>
        ENTITY_ORDER.indexOf(left.entity_type) - ENTITY_ORDER.indexOf(right.entity_type),
    );
    if (errors.length > 0) {
      return errors.map((error) => new SelectableReadOnlyInput(errorLine(error)));
    }
    const lines = ENTITY_ORDER.flatMap((entity) => {
      const line = summaryLine(result, entity);
      return line ? [new Text(line)] : [];
    });
    return lines.length > 0 ? lines : [new Text('No changes')];
  };

  /** Builds the import file, preview, confirmation, and result controls. */
  const importPage = (): Group => {
    if (!options.capabilities.canImportData) return permissionPage('Import');
    const ready = state.kind === 'ready' ? state : undefined;
    const initialMode = ready?.importSelection?.mode === 'update-existing' ? 1 : 0;
    const mode = signal(initialMode);
    const modeControl = new RadioGroup({
      labels: ['Keep existing records', 'Update existing records'],
      value: mode,
    });
    const selectedMode = (): AdminPortabilityImportMode =>
      mode() === 1 ? 'update-existing' : 'keep-existing';
    const previewIsCurrent = (): boolean =>
      ready?.preview !== undefined && selectedMode() === ready.importSelection?.mode;
    const appliedIsCurrent = (): boolean =>
      ready?.applied !== undefined && selectedMode() === ready.importSelection?.mode;
    let modeMounted = false;
    modeControl.onMount(() => {
      modeControl.bind(selectedMode, (selected) => {
        if (!modeMounted) {
          modeMounted = true;
          return;
        }
        options.onIntent({ kind: 'set-import-mode', mode: selected });
      });
    });
    const choose = new Button('Choose manifest…', {
      disabled: ready?.pending !== undefined,
      onClick: () => options.onIntent({ kind: 'choose-manifest' }),
    });
    const previewAction = new Button('Preview', {
      disabled: () => !ready?.importSelection || ready.pending !== undefined,
      onClick: () => options.onIntent({ kind: 'preview', mode: selectedMode() }),
    });
    const apply = new Button('Apply', {
      disabled: () =>
        !previewIsCurrent() || ready?.preview?.errors.length !== 0 || ready?.pending !== undefined,
      onClick: () => options.onIntent({ kind: 'apply', mode: selectedMode() }),
    });
    const close = new Button('Close', { onClick: () => options.onIntent({ kind: 'close' }) });
    const filename = new SelectableReadOnlyInput(
      ready?.importSelection?.filename ?? 'No manifest selected',
    );
    const visibleResult = appliedIsCurrent()
      ? ready?.applied
      : previewIsCurrent()
        ? ready?.preview
        : undefined;
    const rows = resultRows(visibleResult);
    const resultColumn = col({ gap: 1 }, ...rows.map((view) => fixed(view, 1)));
    const page = tabPage(
      col(
        { padding: 1, gap: 1 },
        fixed(row({ gap: 1 }, choose, fixed(filename, 32), spacer()), 2),
        fixed(modeControl, 2),
        fixed(row({ gap: 1 }, previewAction, apply, close, spacer()), 2),
        ready?.feedback && fixed(new Text(ready.feedback), 1),
        grow(resultColumn),
      ),
    );
    const firstError = rows.find((view) => view instanceof SelectableReadOnlyInput) ?? null;
    tabFocus = [tabFocus[0] ?? null, firstError ?? choose];
    if (firstError) firstError.onMount(() => options.focusView?.(firstError));
    return page;
  };

  /** Rebuilds both retained pages from one state snapshot. */
  const render = (): void => {
    for (const child of [...content.children]) content.remove(child);
    if (state.kind === 'closed') return;
    tabFocus = [null, null];
    const tabs: Signal<Tab[]> = signal([
      { title: 'Export', content: exportPage() },
      { title: 'Import', content: importPage() },
    ]);
    currentTabs = new TabView({ tabs, active: activeTab });
    content.add(cover(currentTabs));
  };

  render();
  return {
    content,
    setState(next) {
      if (
        next.kind === 'ready' &&
        (next.importSelection !== undefined ||
          next.preview !== undefined ||
          next.applied !== undefined)
      ) {
        activeTab.set(1);
      }
      state =
        next.kind === 'ready' && !next.exportSelection
          ? { ...next, exportSelection: readExportSelection() }
          : next;
      render();
    },
    focusCurrent() {
      const focus = tabFocus[activeTab.peek()] ?? currentTabs?.strip;
      if (focus) options.focusView?.(focus);
    },
    clear() {
      state = { kind: 'closed' };
      activeTab.set(options.capabilities.canExportData ? 0 : 1);
      render();
    },
  };
}
