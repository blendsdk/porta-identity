/** Direct operation ownership for the terminal configuration workspace. */
import { confirm } from '@jsvision/ui';
import type { EventLoop, ModalDialogHost, View } from '@jsvision/ui';
import type { AdminConnectionState } from './state.js';
import type { AdminSystemConfigOperations } from './system-config-service.js';
import { projectAdminConfigDrafts, setAdminConfigDraft } from './system-config-state.js';
import type {
  AdminSystemConfigIntent,
  AdminSystemConfigWorkspaceState,
} from './system-config-state.js';
import { createAdminSystemConfigWorkspace } from './system-config-workspace.js';
import type { AdminSystemConfigWorkspace } from './system-config-workspace.js';

/** Stable top-level configuration command shared with presentation. */
export const SYSTEM_CONFIG_COMMAND = 'system-config';

/** Existing application host with direct focus restoration. */
export interface AdminSystemConfigControllerHost extends ModalDialogHost {
  /** Focus operations supplied by the existing terminal event loop. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'focusView' | 'getFocused'>;
}
/** Focused dependencies; no shared form framework or mutation retries. */
export interface AdminSystemConfigControllerOptions {
  /** Existing modal and focus host. */
  readonly host: AdminSystemConfigControllerHost;
  /** Reads the currently verified session. */
  readonly readState: () => AdminConnectionState;
  /** Reads session-bound configuration operations. */
  readonly readOperations: () => AdminSystemConfigOperations | undefined;
  /** Mounts or removes only this feature's window. */
  readonly mountWorkspace: (content: View | null) => void;
  /** Re-enters authentication after the server rejects the current session. */
  readonly requestAuthentication?: () => void;
  /** Refreshes command availability when the window opens. */
  readonly onWorkspaceOpened?: () => void;
  /** Refreshes command availability when the window closes. */
  readonly onWorkspaceClosed?: () => void;
  /** Existing confirmation boundary, injectable for deterministic external interaction. */
  readonly dialogs?: { readonly confirmDiscard: () => Promise<boolean> };
}
/** Application-owned configuration lifecycle. */
export interface AdminSystemConfigController {
  /** Applies the verified-session ownership epoch. */
  readonly syncContext: (state: AdminConnectionState, epoch: number) => void;
  /** Opens the workspace for the stable command. */
  readonly handleCommand: (command: string) => boolean;
  /** Handles one closed draft/save/close intent. */
  readonly handleIntent: (intent: AdminSystemConfigIntent) => void;
  /** Reports whether this controller owns a window. */
  readonly isOpen: () => boolean;
  /** Requests ordinary clean/dirty closure. */
  readonly close: () => void;
  /** Releases local ownership after logout, shutdown or session replacement. */
  readonly cancelActiveOperation: () => void;
  /** Permanently releases this controller and any mounted window. */
  readonly dispose: () => void;
}

/**
 * Creates a direct controller that ignores late results after session ownership is released.
 * Releasing a local result does not claim that a server mutation was cancelled.
 * @param options - Existing host, verified session, operations and workspace mounting boundary.
 * @returns Reusable configuration controller.
 * @example createAdminSystemConfigController({ host, readState, readOperations, mountWorkspace });
 */
export function createAdminSystemConfigController(
  options: AdminSystemConfigControllerOptions,
): AdminSystemConfigController {
  let workspace: AdminSystemConfigWorkspace | undefined;
  let state: AdminSystemConfigWorkspaceState = { kind: 'closed' };
  let context: string | undefined;
  let generation = 0;
  let disposed = false;
  let previousFocus: View | null = null;

  /** Publishes one immutable projection without changing editor identity. */
  const publish = (next: AdminSystemConfigWorkspaceState): void => {
    state = next;
    workspace?.setState(next);
  };
  /** Releases ownership so delayed remote results cannot remount protected content. */
  const release = (): void => {
    generation++;
    if (!workspace) return;
    workspace.clear();
    workspace = undefined;
    state = { kind: 'closed' };
    options.mountWorkspace(null);
    if (previousFocus?.mounted) options.host.loop.focusView(previousFocus);
    previousFocus = null;
    options.onWorkspaceClosed?.();
  };
  /** Only a live readable session may operate this global feature. */
  const authority = (): Extract<AdminConnectionState, { kind: 'authenticated' }> | undefined => {
    const current = options.readState();
    return current.kind === 'authenticated' &&
      'canReadConfig' in current.capabilities &&
      current.capabilities.canReadConfig === true
      ? current
      : undefined;
  };
  /** Converts an unexpected external throw to fixed safe feedback, never exception text. */
  const load = async (owner: number): Promise<void> => {
    try {
      const result = await options.readOperations()?.listConfig();
      if (disposed || owner !== generation || !workspace) return;
      if (result?.kind === 'session-invalid') {
        release();
        options.requestAuthentication?.();
      } else if (result?.kind === 'success') {
        publish({ kind: 'ready', entries: result.value });
        workspace?.focusCurrent();
      } else
        publish({
          kind: 'failure',
          failure: result?.kind === 'failure' ? result.failure : 'unavailable',
        });
    } catch {
      if (!disposed && owner === generation && workspace)
        publish({ kind: 'failure', failure: 'unavailable' });
    }
  };
  /** Saves one batch and reloads once, preserving drafts whenever the outcome is uncertain. */
  const save = async (): Promise<void> => {
    const current = authority();
    const operations = options.readOperations();
    if (!current || !operations || state.kind !== 'ready') return;
    const projection = projectAdminConfigDrafts(
      state,
      'canUpdateConfig' in current.capabilities && current.capabilities.canUpdateConfig === true,
    );
    if (!projection.canSave) return;
    const original = state;
    const owner = generation;
    publish({ ...original, busy: true });
    try {
      const result = await operations.setConfigMany(projection.values);
      if (disposed || owner !== generation || !workspace) return;
      if (result.kind === 'session-invalid') {
        release();
        options.requestAuthentication?.();
        return;
      }
      if (result.kind === 'failure') {
        publish({ ...original, busy: false, message: 'Could not save configuration.' });
        return;
      }
      const reloaded = await operations.listConfig();
      if (disposed || owner !== generation || !workspace) return;
      if (reloaded.kind === 'session-invalid') {
        release();
        options.requestAuthentication?.();
        return;
      }
      if (result.kind === 'success' && reloaded.kind === 'success') {
        publish({
          kind: 'ready',
          entries: reloaded.value,
          restartRequired: result.restartRequired,
          message: result.restartRequired
            ? 'Saved. Restart every Porta server instance to apply these changes.'
            : 'Configuration saved.',
        });
      } else {
        publish({
          ...original,
          ...(reloaded.kind === 'success' ? { entries: reloaded.value } : {}),
          busy: false,
          message: 'Could not confirm the saved configuration. Review the displayed values.',
        });
      }
    } catch {
      if (!disposed && owner === generation && workspace)
        publish({ ...original, busy: false, message: 'Could not save configuration.' });
    }
  };
  /** Dirty closure asks once; busy operations block duplicate close requests. */
  const requestClose = async (): Promise<void> => {
    if (!workspace || (state.kind === 'ready' && state.busy)) return;
    if (state.kind !== 'ready' || !projectAdminConfigDrafts(state, false).dirtyKeys.length) {
      release();
      return;
    }
    const original = state;
    const owner = generation;
    publish({ ...original, busy: true });
    try {
      const discard = await (options.dialogs?.confirmDiscard() ??
        confirm(options.host, 'Discard unsaved changes?'));
      if (disposed || owner !== generation || !workspace) return;
      if (discard) release();
      else {
        publish(original);
        workspace.focusCurrent();
      }
    } catch {
      if (!disposed && owner === generation && workspace) publish(original);
    }
  };
  const handleIntent = (intent: AdminSystemConfigIntent): void => {
    if (disposed || !workspace) return;
    if (intent.kind === 'close') void requestClose();
    else if (intent.kind === 'save') void save();
    else if (intent.kind === 'set-draft' && state.kind === 'ready')
      publish(setAdminConfigDraft(state, intent.key, intent.text));
  };
  return {
    syncContext(current, epoch) {
      const next =
        current.kind === 'authenticated' &&
        'canReadConfig' in current.capabilities &&
        current.capabilities.canReadConfig === true
          ? `${epoch}:${current.identity.sub}`
          : undefined;
      if (next !== context) {
        release();
        context = next;
      }
    },
    handleCommand(command) {
      if (command !== SYSTEM_CONFIG_COMMAND || disposed) return false;
      const current = authority();
      if (!current || !options.readOperations()) return true;
      if (workspace) {
        workspace.focusCurrent();
        return true;
      }
      previousFocus = options.host.loop.getFocused();
      workspace = createAdminSystemConfigWorkspace({
        capabilities: {
          canReadConfig: true,
          canUpdateConfig:
            'canUpdateConfig' in current.capabilities &&
            current.capabilities.canUpdateConfig === true,
        },
        onIntent: handleIntent,
        focusView: (view) => options.host.loop.focusView(view),
        onClose: () => void requestClose(),
      });
      options.onWorkspaceOpened?.();
      publish({ kind: 'loading' });
      options.mountWorkspace(workspace.content);
      void load(generation);
      return true;
    },
    handleIntent,
    isOpen: () => !!workspace,
    close: () => void requestClose(),
    cancelActiveOperation: release,
    dispose() {
      disposed = true;
      release();
    },
  };
}
