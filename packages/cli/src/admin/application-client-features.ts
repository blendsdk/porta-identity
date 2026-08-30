/** Shell composition for the global application and selected-organization client workspaces. */

import type { View } from '@jsvision/ui';

import {
  showApplicationLifecycleDialog,
  showCreateApplicationDialog,
  showCreateModuleDialog,
  showEditApplicationDialog,
  showEditModuleDialog,
  showModuleDeactivationDialog,
} from './application-dialogs.js';
import { createAdminApplicationController } from './application-controller.js';
import type { AdminApplicationController } from './application-controller.js';
import type {
  AdminApplication,
  AdminApplicationModule,
  AdminApplicationViewState,
} from './application-state.js';
import { createAdminApplicationWorkspace } from './application-workspace.js';
import type {
  AdminApplicationIntent,
  AdminApplicationWorkspace,
} from './application-workspace.js';
import {
  showClientConfigurationDialog,
  showClientLifecycleDialog,
  showGenerateClientSecretDialog,
  showOneTimeClientSecretDialog,
  showRevokeClientSecretDialog,
} from './client-dialogs.js';
import { createAdminClientController } from './client-controller.js';
import type { AdminClientController } from './client-controller.js';
import type {
  AdminClient,
  AdminClientSecret,
  AdminClientViewState,
} from './client-state.js';
import { createAdminClientWorkspace } from './client-workspace.js';
import type { AdminClientIntent, AdminClientWorkspace } from './client-workspace.js';
import type { AdminDialogSurface } from './application-runtime.js';
import type { AdminApplicationSession } from './application.js';
import { ADMIN_COMMANDS } from './presentation.js';
import type { AdminConnectionState } from './state.js';

/** Dependencies supplied by the existing administration shell. */
export interface AdminApplicationClientFeaturesOptions {
  /** Shared modal surface owned by the administration application. */
  readonly dialogs: AdminDialogSurface;
  /** Reads the current verified shell state. */
  readonly readState: () => AdminConnectionState;
  /** Reads the current server-bound operation set. */
  readonly readSession: () => AdminApplicationSession | undefined;
  /** Replaces the single main workspace. */
  readonly mountWorkspace: (workspace: View | null) => void;
  /** Focuses one known focusable workspace child. */
  readonly focusView: (view: View) => void;
  /** Reports whether a feature dialog currently owns terminal input. */
  readonly setDialogBusy: (busy: boolean) => void;
  /** Re-enters authentication after a final session failure. */
  readonly requestAuthentication: () => void;
}

/** Feature lifecycle used by the shell without exposing controller internals. */
export interface AdminApplicationClientFeatures {
  /** Applies authentication and selected-organization changes. */
  readonly syncContext: (state: AdminConnectionState, sessionEpoch: number) => void;
  /** Routes one explicit application or client shell command. */
  readonly handleCommand: (command: string) => void;
  /** Cancels the current dialog or feature operation. */
  readonly cancelActiveOperation: () => void;
  /** Clears unsafe ownership when the terminal enters resize recovery. */
  readonly handleRecoverableGeometry: (recoverable: boolean) => void;
  /** Releases both feature owners exactly once. */
  readonly dispose: () => void;
}

/** Creates the small feature-specific composition used by the existing shell. */
export function createAdminApplicationClientFeatures(
  options: AdminApplicationClientFeaturesOptions,
): AdminApplicationClientFeatures {
  let applicationState: AdminApplicationViewState = { kind: 'closed' };
  let clientState: AdminClientViewState = { kind: 'closed' };
  let applicationWorkspace: AdminApplicationWorkspace | undefined;
  let clientWorkspace: AdminClientWorkspace | undefined;
  let activeWorkspace: 'applications' | 'clients' | undefined;
  let dialogController: AbortController | undefined;
  let dialogGeneration = 0;
  let workflowGeneration = 0;
  let clientCreationOwner: number | undefined;
  let synchronizedSessionEpoch = -1;
  let synchronizedOrganizationId: string | undefined;
  let hasSynchronizedContext = false;
  let disposed = false;

  /** Returns the complete currently validated global application catalog. */
  const applications = (): readonly AdminApplication[] =>
    'applications' in applicationState ? applicationState.applications : [];

  /** Returns the selected application detail only when it is currently retained. */
  const selectedApplication = (): AdminApplication | undefined =>
    applicationState.kind === 'detail' ? applicationState.application : undefined;

  /** Returns the selected client detail or secret projection. */
  const selectedClient = (): AdminClient | undefined =>
    clientState.kind === 'detail' || clientState.kind === 'secrets'
      ? clientState.client
      : undefined;

  /** Returns one selected client's metadata-only secret. */
  const selectedSecret = (secretId: string): AdminClientSecret | undefined =>
    clientState.kind === 'secrets'
      ? clientState.secrets.find((secret) => secret.id === secretId)
      : undefined;

  /** Publishes application state and repaints only when that workspace is active. */
  const publishApplicationState = (state: AdminApplicationViewState): void => {
    applicationState = state;
    applicationWorkspace?.setState(state);
    if (activeWorkspace === 'applications') applicationWorkspace?.focusCurrent();
  };

  /** Publishes client state and repaints only when that workspace is active. */
  const publishClientState = (state: AdminClientViewState): void => {
    clientState = state;
    clientWorkspace?.setState(state);
    if (activeWorkspace === 'clients') clientWorkspace?.focusCurrent();
  };

  const applicationController: AdminApplicationController = createAdminApplicationController({
    readState: options.readState,
    readOperations: () => options.readSession()?.applications,
    publishState: publishApplicationState,
    requestAuthentication: options.requestAuthentication,
  });
  const clientController: AdminClientController = createAdminClientController({
    readState: options.readState,
    readOperations: () => options.readSession()?.clients,
    publishState: publishClientState,
    resolveApplicationName: (applicationId) =>
      applications().find((application) => application.id === applicationId)?.name,
    presentSecret: async (secret, signal) => {
      options.setDialogBusy(true);
      try {
        await showOneTimeClientSecretDialog(options.dialogs.host, signal, {
          clientName: secret.clientName,
          clientId: secret.oidcClientId,
          label: secret.label,
          plaintext: secret.plaintext,
        });
      } finally {
        options.setDialogBusy(false);
      }
    },
    requestAuthentication: options.requestAuthentication,
  });

  /** Cancels the single feature-owned dialog/operation boundary synchronously. */
  const cancelOwnedWork = (): void => {
    const ownedDialog = dialogController !== undefined;
    workflowGeneration += 1;
    dialogGeneration += 1;
    clientCreationOwner = undefined;
    dialogController?.abort();
    dialogController = undefined;
    options.dialogs.removeAll();
    if (ownedDialog) options.setDialogBusy(false);
    applicationController.cancelActiveOperation();
    clientController.cancelActiveOperation();
  };

  /** Replaces the application workspace using current capabilities. */
  const mountApplications = (): void => {
    const state = options.readState();
    if (state.kind !== 'authenticated') return;
    clientWorkspace?.clear();
    applicationWorkspace?.dispose();
    applicationWorkspace = createAdminApplicationWorkspace({
      capabilities: state.capabilities,
      onIntent: handleApplicationIntent,
      focusView: options.focusView,
    });
    applicationWorkspace.setState(applicationState);
    activeWorkspace = 'applications';
    options.mountWorkspace(applicationWorkspace.content);
  };

  /** Replaces the client workspace for the exact current organization. */
  const mountClients = (): boolean => {
    const state = options.readState();
    if (state.kind !== 'authenticated' || !state.organization) return false;
    applicationWorkspace?.clear();
    clientWorkspace?.dispose();
    clientWorkspace = createAdminClientWorkspace({
      organization: state.organization,
      applications: applications(),
      capabilities: state.capabilities,
      onIntent: handleClientIntent,
      focusView: options.focusView,
    });
    clientWorkspace.setState(clientState);
    activeWorkspace = 'clients';
    options.mountWorkspace(clientWorkspace.content);
    return true;
  };

  /** Runs one shell-owned form while allowing resize, reauthentication, and Quit to abort it. */
  const runDialog = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    if (disposed || dialogController) return undefined;
    const controller = new AbortController();
    const generation = ++dialogGeneration;
    dialogController = controller;
    options.setDialogBusy(true);
    try {
      const result = await work(controller.signal);
      return !disposed && dialogController === controller && generation === dialogGeneration
        ? result
        : undefined;
    } catch {
      return undefined;
    } finally {
      if (dialogController === controller) {
        dialogController = undefined;
        options.setDialogBusy(false);
      }
    }
  };

  /** Wraps a controller-owned confirmation with shell dialog-busy reporting. */
  const confirm = async (work: (signal: AbortSignal) => Promise<boolean>): Promise<boolean> => {
    options.setDialogBusy(true);
    try {
      return await work(new AbortController().signal);
    } finally {
      options.setDialogBusy(false);
    }
  };

  /** Handles the complete closed application intent set. */
  function handleApplicationIntent(intent: AdminApplicationIntent): void {
    if (disposed) return;
    if (intent.kind === 'select') void applicationController.select(intent.applicationId);
    else if (intent.kind === 'retry') void applicationController.reload();
    else if (intent.kind === 'back') void applicationController.load();
    else if (intent.kind === 'create') void createApplication();
    else if (intent.kind === 'edit') void editApplication(intent.applicationId);
    else if (intent.kind === 'activate')
      void applicationController.activate(intent.applicationId, async () => true);
    else if (intent.kind === 'deactivate' || intent.kind === 'archive')
      void changeApplicationLifecycle(intent.kind, intent.applicationId);
    else if (intent.kind === 'add-module') void addModule(intent.applicationId);
    else if (intent.kind === 'edit-module')
      void editModule(intent.applicationId, intent.moduleId);
    else void deactivateModule(intent.applicationId, intent.moduleId);
  }

  /** Handles the complete closed client intent set. */
  function handleClientIntent(intent: AdminClientIntent): void {
    if (disposed) return;
    if (intent.kind === 'select') void clientController.select(intent.clientId);
    else if (intent.kind === 'retry') void clientController.reload();
    else if (intent.kind === 'back') void clientController.load();
    else if (intent.kind === 'create') void createClient();
    else if (intent.kind === 'edit') void editClient(intent.clientId, intent.tab);
    else if (intent.kind === 'activate')
      void clientController.activate(intent.clientId, async () => true);
    else if (intent.kind === 'deactivate' || intent.kind === 'revoke')
      void changeClientLifecycle(intent.kind, intent.clientId);
    else if (intent.kind === 'secrets') void clientController.loadSecrets(intent.clientId);
    else if (intent.kind === 'generate-secret') void generateSecret(intent.clientId);
    else void revokeSecret(intent.clientId, intent.secretId);
  }

  /** Opens and submits the application create form. */
  async function createApplication(): Promise<void> {
    const result = await runDialog((signal) =>
      showCreateApplicationDialog(options.dialogs.host, signal),
    );
    if (result?.kind === 'create') await applicationController.create(result.input);
  }

  /** Opens and submits the application edit form for the retained row. */
  async function editApplication(applicationId: string): Promise<void> {
    const application = selectedApplication();
    if (!application || application.id !== applicationId) return;
    const etag = applicationState.kind === 'detail' ? applicationState.etag ?? undefined : undefined;
    const result = await runDialog((signal) =>
      showEditApplicationDialog(options.dialogs.host, signal, application, etag),
    );
    if (result?.kind === 'update')
      await applicationController.update(result.applicationId, result.input, result.etag);
  }

  /** Confirms an application transition with the exact retained target. */
  async function changeApplicationLifecycle(
    action: 'deactivate' | 'archive',
    applicationId: string,
  ): Promise<void> {
    const application = selectedApplication();
    if (!application || application.id !== applicationId) return;
    const confirmation = (signal: AbortSignal) =>
      confirm(async () => {
        const result = await showApplicationLifecycleDialog(
          options.dialogs.host,
          signal,
          action,
          application,
        );
        return result.kind === action;
      });
    if (action === 'deactivate')
      await applicationController.deactivate(applicationId, confirmation);
    else await applicationController.archive(applicationId, confirmation);
  }

  /** Opens and submits a new module form under the retained application. */
  async function addModule(applicationId: string): Promise<void> {
    if (selectedApplication()?.id !== applicationId) return;
    const result = await runDialog((signal) =>
      showCreateModuleDialog(options.dialogs.host, signal, applicationId),
    );
    if (result?.kind === 'create-module')
      await applicationController.addModule(applicationId, result.input);
  }

  /** Returns one exact retained same-parent module. */
  const module = (applicationId: string, moduleId: string): AdminApplicationModule | undefined =>
    applicationState.kind === 'detail' && applicationState.application.id === applicationId
      ? applicationState.modules.find((item) => item.id === moduleId)
      : undefined;

  /** Opens and submits one retained module edit form. */
  async function editModule(applicationId: string, moduleId: string): Promise<void> {
    const target = module(applicationId, moduleId);
    if (!target) return;
    const result = await runDialog((signal) =>
      showEditModuleDialog(options.dialogs.host, signal, target),
    );
    if (result?.kind === 'update-module')
      await applicationController.updateModule(applicationId, moduleId, result.input);
  }

  /** Confirms one retained same-parent module deactivation. */
  async function deactivateModule(applicationId: string, moduleId: string): Promise<void> {
    const application = selectedApplication();
    const target = module(applicationId, moduleId);
    if (!application || !target) return;
    await applicationController.deactivateModule(applicationId, moduleId, (signal) =>
      confirm(async () =>
        (await showModuleDeactivationDialog(options.dialogs.host, signal, application, target)).kind ===
        'deactivate-module',
      ),
    );
  }

  /** Opens and submits the selected-organization client create form. */
  async function createClient(): Promise<void> {
    if (clientCreationOwner !== undefined) return;
    const state = options.readState();
    if (state.kind !== 'authenticated' || !state.organization) return;
    const organization = state.organization;
    const generation = ++workflowGeneration;
    clientCreationOwner = generation;
    try {
      if (applications().length === 0 && state.capabilities.canReadApplications) {
        await applicationController.load();
      }
      const current = options.readState();
      const activeApplications = applications().filter(
        (application) => application.status === 'active',
      );
      if (
        disposed ||
        generation !== workflowGeneration ||
        activeWorkspace !== 'clients' ||
        current.kind !== 'authenticated' ||
        current.organization?.id !== organization.id ||
        activeApplications.length === 0
      ) {
        return;
      }
      const result = await runDialog((signal) =>
        showClientConfigurationDialog(options.dialogs.host, signal, {
          mode: 'create',
          organization,
          applications: activeApplications,
          initialTab: 'Basic',
        }),
      );
      if (result?.kind === 'create') await clientController.create(result.input);
    } finally {
      if (clientCreationOwner === generation) clientCreationOwner = undefined;
    }
  }

  /** Opens the shared client configuration dialog on the requested entry tab. */
  async function editClient(
    clientId: string,
    tab: Extract<AdminClientIntent, { readonly kind: 'edit' }>['tab'],
  ): Promise<void> {
    const client = selectedClient();
    const state = options.readState();
    if (!client || client.id !== clientId || state.kind !== 'authenticated' || !state.organization)
      return;
    const organization = state.organization;
    const result = await runDialog((signal) =>
      showClientConfigurationDialog(options.dialogs.host, signal, {
        mode: 'edit',
        organization,
        client,
        initialTab: tab,
      }),
    );
    if (result?.kind === 'update') {
      const etag = clientState.kind === 'detail' ? clientState.etag ?? undefined : undefined;
      await clientController.update(result.clientId, result.input, etag);
    }
  }

  /** Confirms a client transition with its selected organization and retained row. */
  async function changeClientLifecycle(
    action: 'deactivate' | 'revoke',
    clientId: string,
  ): Promise<void> {
    const client = selectedClient();
    const state = options.readState();
    if (!client || client.id !== clientId || state.kind !== 'authenticated' || !state.organization)
      return;
    const organization = state.organization;
    const confirmation = (signal: AbortSignal) =>
      confirm(async () =>
        (await showClientLifecycleDialog(options.dialogs.host, signal, action, organization, client))
          .kind === action,
      );
    if (action === 'deactivate') await clientController.deactivate(clientId, confirmation);
    else await clientController.revoke(clientId, confirmation);
  }

  /** Opens the bounded modern-secret generation form. */
  async function generateSecret(clientId: string): Promise<void> {
    const client = selectedClient();
    if (!client || client.id !== clientId) return;
    const result = await runDialog((signal) =>
      showGenerateClientSecretDialog(options.dialogs.host, signal, client),
    );
    if (result?.kind === 'generate')
      await clientController.generateSecret(result.clientId, result.input);
  }

  /** Confirms permanent revocation for one retained same-parent active secret. */
  async function revokeSecret(clientId: string, secretId: string): Promise<void> {
    const client = selectedClient();
    const secret = selectedSecret(secretId);
    const state = options.readState();
    if (
      !client ||
      client.id !== clientId ||
      !secret ||
      state.kind !== 'authenticated' ||
      !state.organization
    )
      return;
    const organization = state.organization;
    await clientController.revokeSecret(clientId, secretId, (signal) =>
      confirm(async () =>
        (await showRevokeClientSecretDialog(
          options.dialogs.host,
          signal,
          organization,
          client,
          secret,
        )).kind === 'revoke-secret',
      ),
    );
  }

  return {
    syncContext(state, sessionEpoch) {
      if (disposed) return;
      applicationController.syncContext(state, sessionEpoch);
      clientController.syncContext(state, sessionEpoch);
      const nextOrganization = state.kind === 'authenticated' ? state.organization?.id : undefined;
      const authenticationChanged =
        state.kind !== 'authenticated' ||
        (hasSynchronizedContext && synchronizedSessionEpoch !== sessionEpoch);
      const organizationChanged =
        hasSynchronizedContext && synchronizedOrganizationId !== nextOrganization;
      if (authenticationChanged || organizationChanged) cancelOwnedWork();
      synchronizedSessionEpoch = state.kind === 'authenticated' ? sessionEpoch : -1;
      synchronizedOrganizationId = nextOrganization;
      hasSynchronizedContext = true;
      if (organizationChanged) {
        workflowGeneration += 1;
        clientWorkspace?.clear();
        if (activeWorkspace === 'clients') {
          activeWorkspace = undefined;
          options.mountWorkspace(null);
        }
      }
      if (state.kind !== 'authenticated') {
        applicationWorkspace?.clear();
        clientWorkspace?.clear();
        activeWorkspace = undefined;
        options.mountWorkspace(null);
      }
    },
    handleCommand(command) {
      if (disposed) return;
      if (command === ADMIN_COMMANDS.browseApplications) {
        mountApplications();
        void applicationController.load();
      } else if (command === ADMIN_COMMANDS.createApplication) {
        mountApplications();
        void createApplication();
      } else if (command === ADMIN_COMMANDS.browseClients) {
        if (mountClients()) void clientController.load();
      } else if (command === ADMIN_COMMANDS.createClient) {
        if (mountClients()) void createClient();
      }
    },
    cancelActiveOperation() {
      cancelOwnedWork();
    },
    handleRecoverableGeometry(recoverable) {
      applicationController.handleRecoverableGeometry(recoverable);
      clientController.handleRecoverableGeometry(recoverable);
      if (!recoverable) this.cancelActiveOperation();
    },
    dispose() {
      if (disposed) return;
      workflowGeneration += 1;
      dialogGeneration += 1;
      dialogController?.abort();
      dialogController = undefined;
      options.setDialogBusy(false);
      applicationController.dispose();
      clientController.dispose();
      applicationWorkspace?.dispose();
      clientWorkspace?.dispose();
      options.mountWorkspace(null);
      disposed = true;
    },
  };
}
