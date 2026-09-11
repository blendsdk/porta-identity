/** Operation ownership for the selected-organization management workspace. */

import { readFile as readBinaryFile } from 'node:fs/promises';

import { openFile as openNativeFile } from '@jsvision/files';
import type { OpenFileOptions } from '@jsvision/files';
import {
  Button,
  col,
  Commands,
  cover,
  Dialog,
  fixed,
  row,
  spacer,
  Text,
} from '@jsvision/ui';
import type { EventLoop, ModalDialogHost, View } from '@jsvision/ui';

import type { AdminOrganizationWorkspaceOperations } from './organization-service.js';
import type {
  AdminConnectionState,
  AdminOrganizationAssetContentType,
  AdminOrganizationAssetType,
  AdminOrganizationIntent,
  AdminOrganizationSettings,
  AdminOrganizationWorkspaceFailureKind,
  AdminOrganizationWorkspaceProjection,
  AdminOrganizationWorkspaceState,
  AdminOrganizationWorkspaceTab,
} from './state.js';

/** Command value shared with the Organizations menu. */
export const MANAGE_ORGANIZATION_COMMAND = 'manage-organization';

/** Minimal mounted workspace contract owned by the controller. */
export interface AdminOrganizationWorkspace {
  /** Content mounted into the existing administration presentation. */
  readonly content: View;
  /** Replaces the complete immutable workspace state. */
  readonly setState: (state: AdminOrganizationWorkspaceState) => void;
  /** Restores focus within the current tab. */
  readonly focusCurrent: () => void;
  /** Releases retained bindings and state. */
  readonly clear?: () => void;
}

/** Construction values supplied to the direct organization workspace. */
export interface AdminOrganizationWorkspaceOptions {
  /** Capabilities from the current verified session. */
  readonly capabilities: Extract<AdminConnectionState, { readonly kind: 'authenticated' }>['capabilities'];
  /** Receives only closed organization intents; the controller owns remote work. */
  readonly onIntent: (intent: AdminOrganizationIntent) => void;
  /** Focuses a mounted view through the owning application loop. */
  readonly focusView?: (view: View) => void;
  /** Reports a direct modeless-window close to the controller. */
  readonly onClose?: () => void;
}

/** Modal host needed for focused lifecycle and asset confirmations. */
export interface AdminOrganizationControllerHost extends ModalDialogHost {
  /** Event loop operations used by the focused dialogs. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'focusView'>;
}

/** Dependencies for one direct selected-organization controller. */
export interface AdminOrganizationControllerOptions {
  /** Existing JSVision application host. */
  readonly host: AdminOrganizationControllerHost;
  /** Reads the latest application-owned session and organization context. */
  readonly readState: () => AdminConnectionState;
  /** Reads the focused organization operations for the current verified session. */
  readonly readOperations: () => AdminOrganizationWorkspaceOperations | undefined;
  /** Mounts or removes only the organization workspace. */
  readonly mountWorkspace: (content: View | null) => void;
  /** Enters the existing reauthentication flow after a final session failure. */
  readonly requestAuthentication: () => void;
  /** Constructs the direct workspace; tests may inject a deterministic implementation. */
  readonly workspaceFactory: (
    options: AdminOrganizationWorkspaceOptions,
  ) => AdminOrganizationWorkspace;
  /** Opens the native file picker; injectable only for deterministic tests. */
  readonly openFile?: (options: OpenFileOptions) => Promise<string | null | undefined>;
  /** Reads the selected file bytes; injectable only for deterministic tests. */
  readonly readFile?: (path: string) => Promise<Uint8Array>;
  /** Reconciles selected-organization fields after an authoritative reload. */
  readonly onOrganizationChange?: (organization: AdminOrganizationSettings) => void;
  /** Refreshes application command availability after a direct window close. */
  readonly onWorkspaceClosed?: () => void;
}

/** Application-owned organization workspace boundary. */
export interface AdminOrganizationController {
  /** Applies the latest organization and verified-session epoch. */
  readonly syncContext: (state: AdminConnectionState, sessionEpoch: number) => void;
  /** Handles the recognized top-level Manage command. */
  readonly handleCommand: (command: string) => boolean;
  /** Handles a workspace intent without exposing asynchronous ownership to the view. */
  readonly handleIntent: (intent: AdminOrganizationIntent) => void;
  /** Returns whether this controller currently owns a workspace. */
  readonly isOpen: () => boolean;
  /** Closes the current workspace while retaining the reusable controller. */
  readonly close: () => void;
  /** Cancels current ownership and removes the workspace. */
  readonly dispose: () => void;
}

/** Result categories shared by direct workspace mutations. */
type MutationResult = Awaited<ReturnType<AdminOrganizationWorkspaceOperations['update']>>;

/** Stable owner captured before an asynchronous selected-organization operation starts. */
interface OrganizationOperationOwner {
  readonly generation: number;
  readonly organizationId: string;
}

/** Capability required by one organization mutation family. */
type OrganizationMutationCapability = 'update' | 'suspend';

/** Outcome of reconciling one mutation with its authoritative read resource. */
type ReloadResult =
  | { readonly kind: 'success' }
  | { readonly kind: 'stale' }
  | { readonly kind: 'failure'; readonly failure: AdminOrganizationWorkspaceFailureKind };

/** Optional feedback published with an otherwise ready workspace projection. */
interface ReadyFeedback {
  readonly failure?: AdminOrganizationWorkspaceFailureKind;
  readonly feedbackTab?: AdminOrganizationWorkspaceTab;
  readonly reloadedAfterFailure?: boolean;
  readonly savedTab?: AdminOrganizationWorkspaceTab;
}

/** Returns a stable identity for one authenticated organization context. */
function contextKey(state: AdminConnectionState, sessionEpoch: number): string | undefined {
  return state.kind === 'authenticated' && state.organization
    ? `${sessionEpoch}:${state.organization.id}`
    : undefined;
}

/** Returns a fixed failure for a completed non-success mutation. */
function mutationFailure(result: MutationResult): AdminOrganizationWorkspaceFailureKind {
  return result.kind === 'failure' ? result.failure : 'unavailable';
}

/** Supported image suffixes and the media type declared to the server. */
const IMAGE_CONTENT_TYPES: ReadonlyArray<
  readonly [suffix: string, contentType: AdminOrganizationAssetContentType]
> = [
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.svg', 'image/svg+xml'],
];

/** Maximum decoded byte size for each stored branding image slot. */
const ASSET_LIMITS: Readonly<Record<AdminOrganizationAssetType, number>> = {
  logo: 2 * 1024 * 1024,
  favicon: 512 * 1024,
};

/** Resolves an approved media type from a user-selected filename. */
function imageContentType(path: string): AdminOrganizationAssetContentType | undefined {
  const normalized = path.toLowerCase();
  return IMAGE_CONTENT_TYPES.find(([suffix]) => normalized.endsWith(suffix))?.[1];
}

/** Opens one focused Keep/confirm dialog and always removes it. */
async function confirmAction(
  host: AdminOrganizationControllerHost,
  title: string,
  message: string,
  action: string,
): Promise<boolean> {
  const dialog = new Dialog({ title, width: 46, height: 9, centered: true });
  const keep = new Button('Keep', { command: Commands.cancel, default: true });
  const confirm = new Button(action, { command: Commands.ok });
  dialog.add(
    cover(
      col(
        { padding: 1, gap: 1 },
        fixed(new Text(message), 1),
        spacer(),
        fixed(row({ gap: 1, justify: 'end' }, keep, confirm), 2),
      ),
    ),
  );
  host.desktop.addWindow(dialog);
  host.loop.focusView(keep);
  try {
    return (await host.loop.execView<string>(dialog)) === Commands.ok;
  } finally {
    host.desktop.removeWindow(dialog);
  }
}

/** Creates the small controller for one active organization at a time. */
export function createAdminOrganizationController(
  options: AdminOrganizationControllerOptions,
): AdminOrganizationController {
  let key: string | undefined;
  let organizationId: string | undefined;
  let generation = 0;
  let workspace: AdminOrganizationWorkspace | undefined;
  let mounted = false;
  let projection: AdminOrganizationWorkspaceProjection | undefined;
  const pendingTabs = new Set<AdminOrganizationWorkspaceTab>();
  let disposed = false;

  /** Publishes state only to the current workspace owner. */
  const publish = (state: AdminOrganizationWorkspaceState): void => {
    if (!disposed) workspace?.setState(state);
  };

  /** Mounts the workspace only after its first authoritative load has settled. */
  const mount = (): void => {
    if (!mounted && workspace) {
      options.mountWorkspace(workspace.content);
      mounted = true;
    }
  };

  /** Publishes authoritative data with current per-tab pending ownership. */
  const publishReady = (feedback: ReadyFeedback = {}): void => {
    if (!projection) return;
    publish({
      kind: 'ready',
      ...projection,
      ...(pendingTabs.size > 0 ? { pendingTabs: [...pendingTabs] } : {}),
      ...feedback,
    });
  };

  /** Closes the current workspace and invalidates every late continuation. */
  const close = (): void => {
    generation += 1;
    pendingTabs.clear();
    projection = undefined;
    workspace?.clear?.();
    workspace = undefined;
    mounted = false;
    options.mountWorkspace(null);
  };

  /** Returns true only for a continuation that still owns the selected context. */
  const owns = (capturedGeneration: number, capturedId: string): boolean =>
    !disposed && generation === capturedGeneration && organizationId === capturedId;

  /** Returns true when the latest verified session may update the captured organization. */
  const hasCapability = (
    owner: OrganizationOperationOwner,
    capability: OrganizationMutationCapability,
  ): boolean => {
    const state = options.readState();
    return (
      owns(owner.generation, owner.organizationId) &&
      state.kind === 'authenticated' &&
      state.organization?.id === owner.organizationId &&
      (capability === 'update'
        ? state.capabilities.canUpdateOrganizations
        : state.capabilities.canSuspendOrganizations)
    );
  };

  /** Ends the stale workspace and delegates authentication to the existing coordinator. */
  const sessionInvalid = (): void => {
    close();
    options.requestAuthentication();
  };

  /** Loads the complete organization and asset metadata into one authoritative projection. */
  const load = async (owner?: OrganizationOperationOwner): Promise<ReloadResult> => {
    const operations = options.readOperations();
    const selectedId = owner?.organizationId ?? organizationId;
    const capturedGeneration = owner?.generation ?? generation;
    if (!selectedId || !owns(capturedGeneration, selectedId)) {
      return { kind: 'stale' };
    }
    if (!operations) return { kind: 'failure', failure: 'unavailable' };
    if (projection) publish({ kind: 'loading', previous: projection });
    const organizationResult = await operations.get(selectedId, new AbortController().signal);
    if (!owns(capturedGeneration, selectedId)) return { kind: 'stale' };
    if (organizationResult.kind === 'session-invalid') {
      sessionInvalid();
      return { kind: 'stale' };
    }
    if (organizationResult.kind === 'failure') {
      if (!projection) {
        mount();
        publish({ kind: 'failure', failure: organizationResult.failure });
      }
      return organizationResult;
    }
    const assetResult = await operations.listAssets(selectedId, new AbortController().signal);
    if (!owns(capturedGeneration, selectedId)) return { kind: 'stale' };
    if (assetResult.kind === 'session-invalid') {
      sessionInvalid();
      return { kind: 'stale' };
    }
    if (assetResult.kind === 'failure') {
      if (!projection) {
        mount();
        publish({
          kind: 'failure',
          failure: assetResult.failure,
          organization: organizationResult.value,
        });
      }
      return assetResult;
    }
    projection = { organization: organizationResult.value, assets: assetResult.value };
    options.onOrganizationChange?.(organizationResult.value);
    mount();
    publishReady();
    if (!owner) workspace?.focusCurrent();
    return { kind: 'success' };
  };

  /** Runs one tab-owned mutation and reconciles its authoritative resources. */
  const mutate = async (
    tab: AdminOrganizationWorkspaceTab,
    invoke: (operations: AdminOrganizationWorkspaceOperations, id: string) => Promise<MutationResult>,
    reload: (owner: OrganizationOperationOwner) => Promise<ReloadResult> = load,
    capturedOwner?: OrganizationOperationOwner,
    requiredCapability: OrganizationMutationCapability = 'update',
  ): Promise<void> => {
    const operations = options.readOperations();
    const selectedId = capturedOwner?.organizationId ?? organizationId;
    const capturedGeneration = capturedOwner?.generation ?? generation;
    const owner = selectedId
      ? { generation: capturedGeneration, organizationId: selectedId }
      : undefined;
    if (!operations || !owner || !hasCapability(owner, requiredCapability) || pendingTabs.has(tab)) {
      return;
    }
    pendingTabs.add(tab);
    publishReady();
    const result = await invoke(operations, owner.organizationId);
    if (!owns(capturedGeneration, owner.organizationId)) return;
    if (result.kind === 'session-invalid') return sessionInvalid();
    if (result.kind === 'cancelled') {
      pendingTabs.delete(tab);
      publishReady();
      return;
    }
    if (result.kind === 'success') {
      const reloadResult = await reload(owner);
      if (!owns(capturedGeneration, owner.organizationId) || reloadResult.kind === 'stale') return;
      pendingTabs.delete(tab);
      if (reloadResult.kind === 'success') publishReady({ savedTab: tab });
      else publishReady({ failure: reloadResult.failure, feedbackTab: tab });
      workspace?.focusCurrent();
      return;
    }
    const reloadResult = await reload(owner);
    if (!owns(capturedGeneration, owner.organizationId) || reloadResult.kind === 'stale') return;
    pendingTabs.delete(tab);
    if (reloadResult.kind === 'success') {
      publishReady({
        failure: mutationFailure(result),
        feedbackTab: tab,
        reloadedAfterFailure: true,
      });
    } else {
      publishReady({ failure: reloadResult.failure, feedbackTab: tab });
    }
    workspace?.focusCurrent();
  };

  /** Reloads both authentication resources once after a save outcome. */
  const reloadAuthentication = async (owner: OrganizationOperationOwner): Promise<ReloadResult> => {
    const operations = options.readOperations();
    const selectedId = owner.organizationId;
    const current = projection;
    if (!owns(owner.generation, selectedId)) return { kind: 'stale' };
    if (!operations || !current) return { kind: 'failure', failure: 'unavailable' };
    const methods = await operations.getLoginMethods(selectedId, new AbortController().signal);
    if (!owns(owner.generation, selectedId)) return { kind: 'stale' };
    if (methods.kind === 'session-invalid') {
      sessionInvalid();
      return { kind: 'stale' };
    }
    const policy = await operations.getTwoFactorPolicy(selectedId, new AbortController().signal);
    if (!owns(owner.generation, selectedId)) return { kind: 'stale' };
    if (policy.kind === 'session-invalid') {
      sessionInvalid();
      return { kind: 'stale' };
    }
    if (methods.kind === 'success' && policy.kind === 'success') {
      projection = {
        ...current,
        organization: {
          ...current.organization,
          defaultLoginMethods: methods.value,
          twoFactorPolicy: policy.value,
        },
      };
      return { kind: 'success' };
    }
    if (methods.kind === 'failure') return methods;
    if (policy.kind === 'failure') return policy;
    return { kind: 'stale' };
  };

  /** Reloads only uploaded image metadata after one immediate asset action. */
  const reloadAssets = async (owner: OrganizationOperationOwner): Promise<ReloadResult> => {
    const operations = options.readOperations();
    const selectedId = owner.organizationId;
    const current = projection;
    if (!owns(owner.generation, selectedId)) return { kind: 'stale' };
    if (!operations || !current) return { kind: 'failure', failure: 'unavailable' };
    const result = await operations.listAssets(selectedId, new AbortController().signal);
    if (!owns(owner.generation, selectedId)) return { kind: 'stale' };
    if (result.kind === 'session-invalid') {
      sessionInvalid();
      return { kind: 'stale' };
    }
    if (result.kind === 'failure') return result;
    projection = { ...current, assets: result.value };
    return { kind: 'success' };
  };

  /** Selects, validates, and immediately uploads one local branding image. */
  const uploadAsset = async (
    assetType: AdminOrganizationAssetType,
    owner: OrganizationOperationOwner,
  ): Promise<void> => {
    if (!projection || !hasCapability(owner, 'update') || pendingTabs.has('branding')) return;
    const pick = options.openFile ?? ((pickerOptions) => openNativeFile(options.host, pickerOptions));
    let path: string | null | undefined;
    try {
      path = await pick({
        title: 'Select image (PNG, JPEG, WebP, ICO, SVG)',
        wildcard: '*.*',
        filter: (entry) => entry.kind === 'file' && imageContentType(entry.name) !== undefined,
      });
    } catch {
      if (owns(owner.generation, owner.organizationId)) {
        publishReady({ failure: 'file-read', feedbackTab: 'branding' });
        workspace?.focusCurrent();
      }
      return;
    }
    if (!owns(owner.generation, owner.organizationId)) return;
    if (!path) {
      workspace?.focusCurrent();
      return;
    }
    const contentType = imageContentType(path);
    if (!contentType) {
      publishReady({ failure: 'file-type', feedbackTab: 'branding' });
      workspace?.focusCurrent();
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = await (options.readFile ?? readBinaryFile)(path);
    } catch {
      if (owns(owner.generation, owner.organizationId)) {
        publishReady({ failure: 'file-read', feedbackTab: 'branding' });
        workspace?.focusCurrent();
      }
      return;
    }
    if (!owns(owner.generation, owner.organizationId)) return;
    if (bytes.length === 0 || bytes.length > ASSET_LIMITS[assetType]) {
      publishReady({ failure: 'file-size', feedbackTab: 'branding' });
      workspace?.focusCurrent();
      return;
    }
    await mutate(
      'branding',
      (operations, id) =>
        operations.uploadAsset(
          id,
          assetType,
          { contentType, data: Buffer.from(bytes).toString('base64') },
          new AbortController().signal,
        ),
      reloadAssets,
      owner,
    );
  };

  /** Confirms and immediately removes one stored branding image. */
  const removeAsset = async (
    assetType: AdminOrganizationAssetType,
    owner: OrganizationOperationOwner,
  ): Promise<void> => {
    if (!projection || !hasCapability(owner, 'update') || pendingTabs.has('branding')) return;
    const label = assetType === 'logo' ? 'logo' : 'favicon';
    const confirmed = await confirmAction(
      options.host,
      `Remove ${label}`,
      `Remove the uploaded ${label}?`,
      'Remove',
    );
    if (!owns(owner.generation, owner.organizationId)) return;
    if (!confirmed) {
      workspace?.focusCurrent();
      return;
    }
    await mutate(
      'branding',
      (operations, id) =>
        operations.deleteAsset(id, assetType, new AbortController().signal),
      reloadAssets,
      owner,
    );
  };

  /** Applies only changed authentication resources in a fixed sequential order. */
  const saveAuthentication = async (
    intent: Extract<AdminOrganizationIntent, { readonly kind: 'save-authentication' }>,
    owner: OrganizationOperationOwner,
  ): Promise<void> => {
    const current = projection?.organization;
    if (!current || !hasCapability(owner, 'update')) return;
    const methodsChanged =
      intent.loginMethods.length !== current.defaultLoginMethods.length ||
      intent.loginMethods.some((method) => !current.defaultLoginMethods.includes(method));
    const policyChanged = intent.twoFactorPolicy !== current.twoFactorPolicy;
    if (!methodsChanged && !policyChanged) return;
    await mutate('authentication', async (operations, id) => {
      if (methodsChanged) {
        const result = await operations.updateLoginMethods(id, intent.loginMethods);
        if (result.kind !== 'success') return result;
        if (!owns(owner.generation, owner.organizationId)) return { kind: 'cancelled' };
      }
      return policyChanged
        ? operations.updateTwoFactorPolicy(id, intent.twoFactorPolicy)
        : { kind: 'success' };
    }, reloadAuthentication, owner);
  };

  /** Handles one focused lifecycle action. */
  const lifecycle = async (
    action: 'activate' | 'suspend',
    owner: OrganizationOperationOwner,
  ): Promise<void> => {
    const current = projection?.organization;
    if (!current || !hasCapability(owner, 'suspend') || pendingTabs.has('overview')) return;
    if (action === 'suspend') {
      if (current.isSuperAdmin) return;
      const confirmed = await confirmAction(
        options.host,
        'Suspend organization',
        `Suspend ${current.name}?`,
        'Suspend',
      );
      if (!owns(owner.generation, owner.organizationId)) return;
      if (!confirmed) {
        workspace?.focusCurrent();
        return;
      }
    }
    await mutate('overview', (operations, id) => operations[action](id), load, owner, 'suspend');
  };

  /** Dispatches one workspace intent only while its opening context still owns the controller. */
  const dispatchIntent = (
    intent: AdminOrganizationIntent,
    owner: OrganizationOperationOwner,
  ): void => {
    if (!owns(owner.generation, owner.organizationId)) return;
    switch (intent.kind) {
      case 'save-overview':
        if (!hasCapability(owner, 'update')) return;
        void mutate('overview', (operations, id) => operations.update(id, intent.input), load, owner);
        return;
      case 'activate':
      case 'suspend':
        void lifecycle(intent.kind, owner);
        return;
      case 'save-authentication':
        if (!hasCapability(owner, 'update')) return;
        void saveAuthentication(intent, owner);
        return;
      case 'save-branding':
        if (!hasCapability(owner, 'update')) return;
        void mutate(
          'branding',
          (operations, id) => operations.updateBranding(id, intent.input),
          load,
          owner,
        );
        return;
      case 'upload-asset':
        if (!hasCapability(owner, 'update')) return;
        void uploadAsset(intent.assetType, owner);
        return;
      case 'remove-asset':
        if (!hasCapability(owner, 'update')) return;
        void removeAsset(intent.assetType, owner);
        return;
    }
  };

  /** Handles a direct controller intent in the current selected-organization context. */
  const handleIntent = (intent: AdminOrganizationIntent): void => {
    const selectedId = organizationId;
    if (!selectedId) return;
    dispatchIntent(intent, { generation, organizationId: selectedId });
  };

  return {
    syncContext(state, sessionEpoch) {
      const nextKey = contextKey(state, sessionEpoch);
      if (nextKey === key) return;
      if (workspace || key !== undefined) close();
      key = nextKey;
      organizationId = state.kind === 'authenticated' ? state.organization?.id : undefined;
    },
    handleCommand(command) {
      if (command !== MANAGE_ORGANIZATION_COMMAND) return false;
      const state = options.readState();
      if (
        disposed ||
        workspace ||
        state.kind !== 'authenticated' ||
        !state.organization ||
        !state.capabilities.canReadOrganizations
      ) {
        return true;
      }
      organizationId = state.organization.id;
      const workspaceOwner = { generation, organizationId: state.organization.id };
      workspace = options.workspaceFactory({
        capabilities: state.capabilities,
        onIntent: (intent) => dispatchIntent(intent, workspaceOwner),
        focusView: (view) => options.host.loop.focusView(view),
        onClose: () => {
          close();
          options.onWorkspaceClosed?.();
        },
      });
      void load();
      return true;
    },
    handleIntent,
    isOpen: () => workspace !== undefined,
    close,
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
    },
  };
}
