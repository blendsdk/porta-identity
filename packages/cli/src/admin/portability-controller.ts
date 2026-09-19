/** Operation ownership and local file workflow for terminal manifest portability. */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { FileDialog, nodeFileSystem, openFile } from '@jsvision/files';
import { filesEn } from '@jsvision/files/locales/en';
import { Commands, confirm, createI18n, signal } from '@jsvision/ui';
import type { EventLoop, ModalDialogHost, View } from '@jsvision/ui';
import { PortaAuthenticationError } from '@portaidentity/sdk';
import type {
  ExportManifestRequest,
  PortabilityApplyResult,
  PortabilityCategory,
  PortabilityEntityType,
  PortabilityManifest,
  PortabilityPreviewResult,
  PortabilityResultError,
} from '@portaidentity/sdk';

import type { AdminApplicationOperations } from './application-service.js';
import { showOneTimeClientSecretDialog } from './client-dialogs.js';
import type {
  AdminPortabilityCapabilities,
  AdminPortabilityWorkspace,
  AdminPortabilityWorkspaceOptions,
} from './portability-workspace.js';
import { createAdminPortabilityWorkspace } from './portability-workspace.js';
import type { AdminPortabilityOperations } from './portability-service.js';
import type {
  AdminPortabilityAppliedResult,
  AdminPortabilityExportSelection,
  AdminPortabilityFeedback,
  AdminPortabilityImportMode,
  AdminPortabilityIntent,
  AdminPortabilityPendingOperation,
  AdminPortabilityWorkspaceState,
} from './portability-state.js';
import type { AdminConnectionState } from './state.js';

/** Stable command recognized by the portability controller and presentation. */
export const PORTABILITY_COMMAND = 'portability';

/** Largest local JSON document read before the server repeats strict validation. */
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

/** Marker used only to distinguish the fixed local size failure. */
const MANIFEST_TOO_LARGE = 'MAX_BYTES_EXCEEDED';

/** Keep Clear and Cancel reachable without changing the application's translation service. */
const manifestFileI18n = createI18n({
  locale: 'en',
  catalogs: [filesEn, { schema: 1, locale: 'en', messages: { 'files.action.clear': 'C~l~ear' } }],
});

/** Result groups in the dependency order used for first-error focus. */
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

/** Modal host required by file, confirmation, and one-time-secret dialogs. */
export interface AdminPortabilityControllerHost extends ModalDialogHost {
  /** Event-loop operations used by the direct save dialog and focus restoration. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Local dialog seams kept injectable for deterministic controller tests. */
export interface AdminPortabilityDialogs {
  /** Chooses one existing JSON manifest. */
  readonly chooseManifest: () => Promise<string | null | undefined>;
  /** Chooses one output path seeded with the server-provided filename. */
  readonly saveManifest: (filename: string) => Promise<string | null | undefined>;
  /** Asks once before applying a successful preview. */
  readonly confirmApply: () => Promise<boolean>;
  /** Shows one credential and resolves only after the operator dismisses it. */
  readonly showOneTimeClientSecret: (
    signal: AbortSignal,
    value: {
      readonly clientName: string;
      readonly clientId: string;
      readonly label: string | null;
      readonly plaintext: string;
      readonly expiresAt: string | null;
    },
  ) => Promise<void>;
}

/** Local UTF-8 file operations kept outside the view. */
export interface AdminPortabilityFiles {
  /** Reads no more than the supplied byte limit. */
  readonly readUtf8: (path: string, maximumBytes: number) => Promise<string>;
  /** Writes one complete UTF-8 manifest. */
  readonly writeUtf8: (path: string, content: string) => Promise<void>;
}

/** Controller construction boundaries. */
export interface AdminPortabilityControllerOptions {
  /** Existing administration application host. */
  readonly host: AdminPortabilityControllerHost;
  /** Reads the current verified connection and selected organization. */
  readonly readState: () => AdminConnectionState;
  /** Reads the current session's manifest operations. */
  readonly readOperations: () => AdminPortabilityOperations | undefined;
  /** Reads the existing global application catalog operation when available. */
  readonly readApplicationOperations?: () =>
    Pick<AdminApplicationOperations, 'listAll'> | undefined;
  /** Mounts or removes only this workspace. */
  readonly mountWorkspace: (content: View | null) => void;
  /** Builds the direct workspace; tests may inject a deterministic boundary. */
  readonly workspaceFactory?: (options: AdminPortabilityWorkspaceOptions) => Pick<
    AdminPortabilityWorkspace,
    'content' | 'setState' | 'focusCurrent'
  > & {
    readonly clear?: () => void;
  };
  /** Enters the existing authentication recovery flow after a final session failure. */
  readonly requestAuthentication?: () => void;
  /** Refreshes command availability after direct workspace closure. */
  readonly onWorkspaceClosed?: () => void;
  /** Refreshes command availability immediately before the workspace is mounted. */
  readonly onWorkspaceOpened?: () => void;
  /** Injectable modal operations. */
  readonly dialogs?: Partial<AdminPortabilityDialogs>;
  /** Injectable local file operations. */
  readonly files?: Partial<AdminPortabilityFiles>;
}

/** Application-owned portability controller. */
export interface AdminPortabilityController {
  /** Applies the latest verified-session ownership epoch. */
  readonly syncContext: (state: AdminConnectionState, sessionEpoch: number) => void;
  /** Opens the workspace for its stable command. */
  readonly handleCommand: (command: string) => boolean;
  /** Handles one closed view intent. */
  readonly handleIntent: (intent: AdminPortabilityIntent) => void;
  /** Returns whether this controller owns a mounted workspace. */
  readonly isOpen: () => boolean;
  /** Cancels local ownership and closes the workspace. */
  readonly cancelActiveOperation: () => void;
  /** Releases the reusable controller permanently. */
  readonly dispose: () => void;
}

/** Parsed local manifest retained only for the current controller generation. */
interface SelectedManifest {
  readonly filename: string;
  readonly value: PortabilityManifest;
}

/** Stable identity captured by one asynchronous controller continuation. */
interface OperationOwner {
  readonly generation: number;
  readonly signal: AbortSignal;
}

/** Returns whether all portability capability fields came from live verified booleans. */
function portabilityCapabilities(
  state: AdminConnectionState,
): AdminPortabilityCapabilities | undefined {
  if (state.kind !== 'authenticated') return undefined;
  const capabilities: Partial<AdminPortabilityCapabilities> = state.capabilities;
  if (
    typeof capabilities.canExportData !== 'boolean' ||
    typeof capabilities.canImportData !== 'boolean' ||
    typeof capabilities.isSuperAdmin !== 'boolean'
  ) {
    return undefined;
  }
  return {
    canExportData: capabilities.canExportData,
    canImportData: capabilities.canImportData,
    isSuperAdmin: capabilities.isSuperAdmin,
    canReadOrganizations: capabilities.canReadOrganizations ?? false,
    canReadApplications: capabilities.canReadApplications ?? false,
    canReadRoles: capabilities.canReadRoles ?? false,
    canReadPermissions: capabilities.canReadPermissions ?? false,
    canReadClaims: capabilities.canReadClaims ?? false,
    canReadUsers: capabilities.canReadUsers ?? false,
    canReadClients: capabilities.canReadClients ?? false,
  };
}

/** Creates the default categories without enabling the optional client section. */
function initialExportSelection(
  state: Extract<AdminConnectionState, { readonly kind: 'authenticated' }>,
  capabilities: AdminPortabilityCapabilities,
): AdminPortabilityExportSelection {
  const categories: PortabilityCategory[] = [];
  if (capabilities.canReadOrganizations) categories.push('organizations');
  if (
    capabilities.canReadApplications &&
    capabilities.canReadRoles &&
    capabilities.canReadPermissions &&
    capabilities.canReadClaims
  ) {
    categories.push('applications_authorization');
  }
  if (capabilities.canReadUsers && capabilities.canReadRoles && capabilities.canReadClaims) {
    categories.push('users_assignments');
  }
  return {
    ...(state.organization && !state.organization.isSuperAdmin
      ? { scope: { kind: 'organization' as const, organization_slug: state.organization.slug } }
      : capabilities.isSuperAdmin
        ? { scope: { kind: 'environment' as const } }
        : {}),
    categories,
    applications: { kind: 'all' },
  };
}

/** Opens one seeded save-mode JSVision file dialog. */
async function saveManifestPath(
  host: AdminPortabilityControllerHost,
  filename: string,
): Promise<string | null> {
  const dialog = new FileDialog({
    fs: nodeFileSystem,
    directory: signal(nodeFileSystem.resolve('.')),
    wildcard: signal('*.json'),
    filename: signal(filename),
    save: true,
    title: 'Save manifest',
    i18n: manifestFileI18n,
  });
  host.desktop.addWindow(dialog);
  try {
    return (await host.loop.execView<string>(dialog)) === Commands.ok ? dialog.result() : null;
  } finally {
    host.desktop.removeWindow(dialog);
  }
}

/** Reads one bounded UTF-8 file using the same direct policy as the conventional CLI. */
async function readBoundedUtf8(path: string, maximumBytes: number): Promise<string> {
  const size = (await stat(path)).size;
  if (size > maximumBytes) throw new Error(MANIFEST_TOO_LARGE);
  const content = await readFile(path, 'utf8');
  if (Buffer.byteLength(content, 'utf8') > maximumBytes) throw new Error(MANIFEST_TOO_LARGE);
  return content;
}

/** Parses JSON while keeping the server as the single strict manifest validator. */
function parseManifest(content: string): PortabilityManifest {
  const parsed: unknown = JSON.parse(content);
  return parsed as PortabilityManifest;
}

/** Returns the first rejected group in dependency order. */
function firstErrorEntity(
  errors: readonly PortabilityResultError[],
): PortabilityEntityType | undefined {
  return ENTITY_ORDER.find((entity) => errors.some((error) => error.entity_type === entity));
}

/** Removes one-time credentials before an apply result enters reusable view state. */
function reusableApplyResult(result: PortabilityApplyResult): AdminPortabilityAppliedResult {
  const { credentials: _credentials, ...reusable } = result;
  return reusable;
}

/** Creates direct controller ownership for one maximized portability workspace. */
export function createAdminPortabilityController(
  options: AdminPortabilityControllerOptions,
): AdminPortabilityController {
  const workspaceFactory = options.workspaceFactory ?? createAdminPortabilityWorkspace;
  const dialogs: AdminPortabilityDialogs = {
    chooseManifest: () =>
      openFile(
        { ...options.host, i18n: manifestFileI18n },
        { wildcard: '*.json', title: 'Choose manifest' },
      ),
    saveManifest: (filename) => saveManifestPath(options.host, filename),
    confirmApply: () => confirm(options.host, 'Are you sure?'),
    showOneTimeClientSecret: (operationSignal, value) =>
      showOneTimeClientSecretDialog(options.host, operationSignal, value),
    ...options.dialogs,
  };
  const files: AdminPortabilityFiles = {
    readUtf8: readBoundedUtf8,
    writeUtf8: async (path, content) => writeFile(path, content, 'utf8'),
    ...options.files,
  };
  let generation = 0;
  let contextKey: string | undefined;
  let workspace:
    | (Pick<AdminPortabilityWorkspace, 'content' | 'setState' | 'focusCurrent'> & {
        readonly clear?: () => void;
      })
    | undefined;
  let operation: AbortController | undefined;
  let opening = false;
  let disposed = false;
  let selectedManifest: SelectedManifest | undefined;
  let importMode: AdminPortabilityImportMode = 'keep-existing';
  let preview: PortabilityPreviewResult | undefined;
  let applied: AdminPortabilityAppliedResult | undefined;
  let exportSelection: AdminPortabilityExportSelection | undefined;
  let pending: AdminPortabilityPendingOperation | undefined;
  let feedback: AdminPortabilityFeedback | undefined;

  /** Publishes only reusable state and never a parsed manifest or plaintext credential. */
  const publish = (): void => {
    if (!workspace) return;
    const next: AdminPortabilityWorkspaceState = {
      kind: 'ready',
      ...(exportSelection ? { exportSelection } : {}),
      ...(selectedManifest
        ? { importSelection: { filename: selectedManifest.filename, mode: importMode } }
        : {}),
      ...(preview
        ? { preview, errors: preview.errors, focusedEntity: firstErrorEntity(preview.errors) }
        : {}),
      ...(applied ? { applied } : {}),
      ...(pending ? { pending } : {}),
      ...(feedback ? { feedback } : {}),
    };
    workspace.setState(next);
    workspace.focusCurrent();
  };

  /** Returns whether a continuation still owns the current mounted workspace. */
  const owns = (owner: OperationOwner): boolean =>
    !disposed && workspace !== undefined && owner.generation === generation;

  /** Starts one locally cancellable operation and invalidates any older continuation. */
  const begin = (kind: AdminPortabilityPendingOperation): OperationOwner => {
    operation?.abort();
    operation = new AbortController();
    generation += 1;
    pending = kind;
    feedback = undefined;
    publish();
    return { generation, signal: operation.signal };
  };

  /** Finishes one still-owned operation and publishes its final state. */
  const finish = (owner: OperationOwner): boolean => {
    if (!owns(owner)) return false;
    pending = undefined;
    operation = undefined;
    publish();
    return true;
  };

  /** Closes the workspace and aborts only local result ownership. */
  const close = (): void => {
    generation += 1;
    opening = false;
    operation?.abort();
    operation = undefined;
    pending = undefined;
    selectedManifest = undefined;
    preview = undefined;
    applied = undefined;
    feedback = undefined;
    workspace?.clear?.();
    workspace = undefined;
    options.mountWorkspace(null);
  };

  /** Converts an SDK failure into fixed feedback or the existing authentication recovery flow. */
  const fail = (
    owner: OperationOwner,
    error: unknown,
    operationFeedback: AdminPortabilityFeedback,
  ): void => {
    if (!owns(owner)) return;
    pending = undefined;
    operation = undefined;
    if (error instanceof PortaAuthenticationError) {
      close();
      options.requestAuthentication?.();
      return;
    }
    feedback = operationFeedback;
    publish();
  };

  /** Performs server export before asking where to save its audited response. */
  const exportManifest = async (request: ExportManifestRequest): Promise<void> => {
    const operations = options.readOperations();
    if (!operations) return;
    exportSelection = {
      scope: request.scope,
      categories: request.categories,
      applications: request.application_selection.all_applications
        ? { kind: 'all' }
        : { kind: 'selected', slugs: request.application_selection.application_slugs },
    };
    const owner = begin('export');
    try {
      const response = await operations.exportManifest(request, owner.signal);
      if (!owns(owner)) return;
      const path = await dialogs.saveManifest(response.filename);
      if (!owns(owner)) return;
      if (!path) {
        finish(owner);
        return;
      }
      try {
        await files.writeUtf8(path, `${JSON.stringify(response.manifest, null, 2)}\n`);
      } catch {
        if (!owns(owner)) return;
        pending = undefined;
        operation = undefined;
        feedback = 'Could not save the export file.';
        publish();
        return;
      }
      finish(owner);
    } catch (error) {
      fail(owner, error, 'Export is unavailable.');
    }
  };

  /** Chooses and parses one local manifest without calling the server. */
  const chooseManifest = async (): Promise<void> => {
    const owner = begin('choose-manifest');
    try {
      const path = await dialogs.chooseManifest();
      if (!owns(owner)) return;
      if (!path) {
        finish(owner);
        return;
      }
      try {
        const content = await files.readUtf8(path, MAX_MANIFEST_BYTES);
        if (!owns(owner)) return;
        selectedManifest = { filename: basename(path), value: parseManifest(content) };
        preview = undefined;
        applied = undefined;
        feedback = undefined;
      } catch (error) {
        if (!owns(owner)) return;
        selectedManifest = undefined;
        preview = undefined;
        applied = undefined;
        feedback =
          error instanceof Error && error.message === MANIFEST_TOO_LARGE
            ? 'The manifest file is too large.'
            : error instanceof SyntaxError
              ? 'Invalid manifest.'
              : 'Could not read the manifest file.';
      }
      finish(owner);
    } catch (error) {
      fail(owner, error, 'Could not read the manifest file.');
    }
  };

  /** Builds a fresh preview for the exact selected file and mode. */
  const previewManifest = async (mode: AdminPortabilityImportMode): Promise<void> => {
    const operations = options.readOperations();
    const selected = selectedManifest;
    if (!operations || !selected) return;
    importMode = mode;
    preview = undefined;
    applied = undefined;
    const owner = begin('preview');
    try {
      preview = await operations.preview(selected.value, owner.signal);
      finish(owner);
    } catch (error) {
      fail(owner, error, 'Preview is unavailable.');
    }
  };

  /** Confirms and applies the current successful preview exactly once. */
  const applyManifest = async (mode: AdminPortabilityImportMode): Promise<void> => {
    const operations = options.readOperations();
    const selected = selectedManifest;
    if (!operations || !selected || !preview || preview.errors.length > 0 || mode !== importMode)
      return;
    const owner = begin('apply');
    try {
      const confirmed = await dialogs.confirmApply();
      if (!owns(owner)) return;
      if (
        !confirmed ||
        selectedManifest !== selected ||
        !preview ||
        preview.errors.length > 0 ||
        mode !== importMode
      ) {
        finish(owner);
        return;
      }
      const result = await operations.apply(selected.value, mode, owner.signal);
      if (!owns(owner)) return;
      applied = reusableApplyResult(result);
      preview = undefined;
      for (const credential of result.credentials ?? []) {
        await dialogs.showOneTimeClientSecret(owner.signal, {
          clientName: credential.client_id,
          clientId: credential.client_id,
          label: credential.label,
          plaintext: credential.secret,
          expiresAt: credential.expires_at,
        });
        if (!owns(owner)) return;
      }
      finish(owner);
    } catch (error) {
      fail(owner, error, 'Apply is unavailable.');
    }
  };

  /** Dispatches one view intent without exposing asynchronous work to the workspace. */
  const handleIntent = (intent: AdminPortabilityIntent): void => {
    switch (intent.kind) {
      case 'export':
        void exportManifest(intent.request);
        return;
      case 'choose-manifest':
        void chooseManifest();
        return;
      case 'set-import-mode':
        importMode = intent.mode;
        preview = undefined;
        applied = undefined;
        publish();
        return;
      case 'preview':
        void previewManifest(intent.mode ?? importMode);
        return;
      case 'apply':
        void applyManifest(intent.mode ?? importMode);
        return;
      case 'close':
        close();
        options.onWorkspaceClosed?.();
        return;
      case 'set-export-scope':
      case 'set-export-category':
      case 'set-all-applications':
      case 'set-application':
        return;
    }
  };

  /** Opens one workspace after reusing the existing application list operation when available. */
  const openWorkspace = async (
    state: Extract<AdminConnectionState, { readonly kind: 'authenticated' }>,
    capabilities: AdminPortabilityCapabilities,
  ): Promise<void> => {
    if (disposed || opening || workspace) return;
    const openGeneration = generation;
    opening = true;
    options.onWorkspaceOpened?.();
    let applications: readonly {
      readonly id: string;
      readonly name: string;
      readonly slug: string;
    }[] = [];
    const applicationOperations = options.readApplicationOperations?.();
    if (applicationOperations && capabilities.canReadApplications) {
      const result = await applicationOperations.listAll();
      if (result.kind === 'success') applications = result.value;
    }
    if (disposed || !opening || workspace || generation !== openGeneration) return;
    exportSelection = initialExportSelection(state, capabilities);
    workspace = workspaceFactory({
      capabilities,
      ...(state.organization ? { organization: state.organization } : {}),
      applications,
      onIntent: handleIntent,
      focusView: (view) => options.host.loop.focusView(view),
      onClose: () => {
        close();
        options.onWorkspaceClosed?.();
      },
    });
    opening = false;
    options.mountWorkspace(workspace.content);
    publish();
  };

  return {
    syncContext(state, sessionEpoch) {
      const nextKey =
        state.kind === 'authenticated'
          ? `${sessionEpoch}:${state.organization?.id ?? 'environment'}`
          : undefined;
      if (nextKey === contextKey) return;
      if (workspace || contextKey !== undefined) close();
      contextKey = nextKey;
    },
    handleCommand(command) {
      if (command !== PORTABILITY_COMMAND) return false;
      const state = options.readState();
      const capabilities = portabilityCapabilities(state);
      if (
        disposed ||
        opening ||
        workspace ||
        state.kind !== 'authenticated' ||
        !capabilities ||
        (!capabilities.canExportData && !capabilities.canImportData) ||
        !options.readOperations()
      ) {
        return true;
      }
      void openWorkspace(state, capabilities);
      return true;
    },
    handleIntent,
    isOpen: () => opening || workspace !== undefined,
    cancelActiveOperation: close,
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
    },
  };
}
