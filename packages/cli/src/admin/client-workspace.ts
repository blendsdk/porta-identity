/** Direct JSVision workspace for clients owned by the selected organization. */

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

import type { AdminApplication } from './application-state.js';
import type {
  AdminClient,
  AdminClientProjection,
  AdminClientSecret,
  AdminClientViewState,
} from './client-state.js';
import type { AdminCapabilities, AdminOrganizationContext } from './state.js';

/** Tabs that enter the shared client configuration dialog. */
export type AdminClientConfigurationTab = 'Basic' | 'Redirects' | 'Protocol' | 'Login';

/** Closed set of intents emitted by the organization client workspace. */
export type AdminClientIntent =
  | { readonly kind: 'create' }
  | { readonly kind: 'select'; readonly clientId: string }
  | { readonly kind: 'retry' }
  | { readonly kind: 'back' }
  | { readonly kind: 'edit'; readonly clientId: string; readonly tab: AdminClientConfigurationTab }
  | { readonly kind: 'activate'; readonly clientId: string }
  | { readonly kind: 'deactivate'; readonly clientId: string }
  | { readonly kind: 'revoke'; readonly clientId: string }
  | { readonly kind: 'secrets'; readonly clientId: string }
  | { readonly kind: 'generate-secret'; readonly clientId: string }
  | { readonly kind: 'revoke-secret'; readonly clientId: string; readonly secretId: string };

/** Inputs for one selected-organization client workspace. */
export interface AdminClientWorkspaceOptions {
  /** Active organization, or absent when organization navigation is disabled. */
  readonly organization?: AdminOrganizationContext;
  /** Validated global applications available for name resolution and create selection. */
  readonly applications: readonly AdminApplication[];
  /** Capabilities from the currently verified session. */
  readonly capabilities: AdminCapabilities;
  /** Receives feature-local actions while controllers retain network ownership. */
  readonly onIntent: (intent: AdminClientIntent) => void;
  /** Focuses a mounted leaf view through the application loop. */
  readonly focusView?: (view: View) => void;
}

/** Mounted organization client workspace controlled by validated state. */
export interface AdminClientWorkspace {
  /** Content mounted inside the administration shell. */
  readonly content: Group;
  /** Replaces the complete validated workspace state. */
  readonly setState: (state: AdminClientViewState) => void;
  /** Restores focus to the current primary control. */
  readonly focusCurrent: () => void;
  /** Removes retained client data. */
  readonly clear: () => void;
  /** Permanently disposes this workspace. */
  readonly dispose: () => void;
}

/** Fixed safe labels for client-operation failures. */
const FAILURE_LABELS = {
  validation: 'Validation failed',
  unauthorized: 'Not authorized',
  conflict: 'Conflict',
  unavailable: 'Service unavailable',
  'invalid-response': 'Invalid server response',
} as const;

/** Returns the application name only when the session may inspect applications. */
function applicationLabel(
  client: AdminClient,
  options: AdminClientWorkspaceOptions,
): string {
  if (!options.capabilities.canReadApplications) return client.applicationId;
  return options.applications.find((application) => application.id === client.applicationId)?.name ?? client.applicationId;
}

/** Builds the required complete client catalog columns. */
function clientColumns(options: AdminClientWorkspaceOptions): Column<AdminClient>[] {
  return [
    { title: 'Name', accessor: (client) => client.clientName, width: 10 },
    { title: 'Client ID', accessor: (client) => client.clientId, width: 10 },
    { title: 'Application', accessor: (client) => applicationLabel(client, options), width: 11 },
    { title: 'Application Type', accessor: (client) => client.applicationType, width: 17 },
    { title: 'Client Type', accessor: (client) => client.clientType, width: 12 },
    { title: 'Status', accessor: (client) => client.status, width: 7 },
  ];
}

/** Metadata-only columns used by secret management. */
const SECRET_COLUMNS: Column<AdminClientSecret>[] = [
  { title: 'Label', accessor: (secret) => secret.label ?? 'Not provided', width: 14 },
  { title: 'Status', accessor: (secret) => secret.status, width: 8 },
  { title: 'Last used', accessor: (secret) => secret.lastUsedAt ?? 'Never', width: 14 },
  { title: 'Expires', accessor: (secret) => secret.expiresAt ?? 'Never', width: 14 },
  { title: 'Created', accessor: (secret) => secret.createdAt, width: 14 },
];

/** Optional operation status shown without obscuring retained validated content. */
interface ProjectionStatus {
  /** Safe fixed status label. */
  readonly label: string;
  /** Whether deliberate authoritative reload is available. */
  readonly retry: boolean;
}

/** Creates the feature-specific client workspace with ordinary Layout DSL primitives. */
export function createAdminClientWorkspace(
  options: AdminClientWorkspaceOptions,
): AdminClientWorkspace {
  const content = new Group();
  let state: AdminClientViewState = { kind: 'closed' };
  let currentFocus: View | null = null;
  let focusedClientId: string | null = null;
  let disposed = false;

  /** Creates a fixed-height action button. */
  const action = (
    label: string,
    intent: AdminClientIntent,
    width: number,
    disabled: boolean | (() => boolean) = false,
  ): Button =>
    fixed(
      new Button(label, { disabled, onClick: () => options.onIntent(intent) }),
      width,
    );

  /** Adds a compact status row when a retained projection is loading or failed. */
  const statusRow = (status: ProjectionStatus | undefined): View | undefined => {
    if (!status) return undefined;
    const retry = status.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    if (retry) currentFocus = retry;
    return fixed(
      row({ gap: 1 }, grow(new Text(status.label)), retry && fixed(retry, 10)),
      2,
    );
  };

  /** Renders the complete same-organization catalog. */
  const renderList = (
    projection: Extract<AdminClientProjection, { kind: 'list' }>,
    status?: ProjectionStatus,
  ): void => {
    const canCreate =
      options.organization?.status === 'active' &&
      options.capabilities.canCreateClients &&
      options.capabilities.canReadApplications &&
      options.applications.some((application) => application.status === 'active');
    const create = new Button('~C~reate', {
      disabled: !canCreate,
      onClick: () => options.onIntent({ kind: 'create' }),
    });
    const heading = row(
      { gap: 1 },
      fixed(new Text(`OIDC Clients — ${options.organization?.name ?? 'organization required'}`), 40),
      spacer(),
      fixed(create, 11),
    );
    let body: View;
    if (projection.clients.length === 0) {
      body = new Text('No OIDC clients');
      currentFocus = canCreate ? create : null;
    } else {
      const rows: Signal<AdminClient[]> = signal([...projection.clients]);
      const focused = signal(
        Math.max(0, projection.clients.findIndex((item) => item.id === focusedClientId)),
      );
      const grid = new DataGrid({
        rows,
        focused,
        columns: clientColumns(options),
        zebra: true,
        onSelect: (_index, selected) => {
          focusedClientId = selected.id;
          options.onIntent({ kind: 'select', clientId: selected.id });
        },
      });
      body = grid;
      currentFocus = grid.rows;
    }
    const denial = options.organization?.status !== 'active'
      ? 'Create requires an active organization'
      : !options.capabilities.canCreateClients
      ? 'Create requires client create'
      : !options.capabilities.canReadApplications
        ? 'Create requires application read'
        : !options.applications.some((application) => application.status === 'active')
          ? 'Create requires an active application'
        : undefined;
    const firstClient = projection.clients[0];
    const applicationSummary = firstClient
      ? `Application: ${applicationLabel(firstClient, options)}`
      : undefined;
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(heading, 2),
          statusRow(status),
          denial && fixed(new Text(denial), 1),
          applicationSummary ? fixed(new Text(applicationSummary), 1) : undefined,
          grow(body),
        ),
      ),
    );
  };

  /** Renders immutable client context plus configuration and lifecycle entry actions. */
  const renderDetail = (
    projection: Extract<AdminClientProjection, { kind: 'detail' }>,
    status?: ProjectionStatus,
  ): void => {
    const selected = projection.client;
    const revoked = selected.status === 'revoked';
    const canUpdate = options.capabilities.canUpdateClients && !revoked;
    const canRevoke = options.capabilities.canRevokeClients && !revoked;
    const application = options.capabilities.canReadApplications
      ? projection.applicationName ?? applicationLabel(selected, options)
      : selected.applicationId;
    const lifecycle = selected.status === 'inactive'
      ? action('~A~ctivate', { kind: 'activate', clientId: selected.id }, 12, !canUpdate)
      : action('~D~eactivate', { kind: 'deactivate', clientId: selected.id }, 14, !canUpdate);
    const configuration = row(
      { gap: 1 },
      ...(['Basic', 'Redirects', 'Protocol', 'Login'] as const).map((tab) =>
        action(tab, { kind: 'edit', clientId: selected.id, tab }, tab.length + 4, !canUpdate),
      ),
      action('Secrets', { kind: 'secrets', clientId: selected.id }, 11, revoked || selected.clientType === 'public'),
    );
    const controls = row(
      { gap: 1 },
      action('~B~ack', { kind: 'back' }, 9),
      lifecycle,
      action('~R~evoke', { kind: 'revoke', clientId: selected.id }, 10, !canRevoke),
      spacer(),
    );
    const details = [
      `Organization: ${options.organization?.name ?? projection.organizationId}`,
      `Name: ${selected.clientName}`,
      `Client ID: ${selected.clientId}`,
      `Application: ${application}`,
      `Application Type: ${selected.applicationType}`,
      `Client Type: ${selected.clientType}`,
      `Status: ${selected.status}`,
      `Redirect URIs: ${selected.redirectUris.join(', ')}`,
      `Post-logout URIs: ${selected.postLogoutRedirectUris.join(', ') || 'None'}`,
      `Grant types: ${selected.grantTypes.join(', ')}`,
      `Response types: ${selected.responseTypes.join(', ')}`,
      `Scope: ${selected.scope}`,
      `Token authentication: ${selected.tokenEndpointAuthMethod}`,
      `Allowed origins: ${selected.allowedOrigins.join(', ') || 'None'}`,
      `PKCE required: ${selected.requirePkce ? 'yes' : 'no'}`,
      `Login methods: ${selected.loginMethods?.join(', ') ?? 'inherit'}`,
      `Effective login methods: ${selected.effectiveLoginMethods.join(', ')}`,
      `Created: ${selected.createdAt}`,
      `Updated: ${selected.updatedAt}`,
    ];
    content.add(
      cover(
        col(
          { gap: 0, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          statusRow(status),
          revoked && fixed(new Text('Revoked clients are read only'), 1),
          !options.capabilities.canUpdateClients && fixed(new Text('Configuration and lifecycle require client update'), 1),
          !options.capabilities.canRevokeClients && fixed(new Text('Revoke requires client revoke'), 1),
          fixed(configuration, 2),
          grow(new Text(details.join('\n'))),
          fixed(controls, 2),
        ),
      ),
    );
    currentFocus = configuration.children[0] ?? controls.children[0] ?? null;
  };

  /** Renders secret metadata without allowing plaintext into retained state. */
  const renderSecrets = (
    projection: Extract<AdminClientProjection, { kind: 'secrets' }>,
    status?: ProjectionStatus,
  ): void => {
    const selectedSecretId = signal<string | null>(projection.secrets[0]?.id ?? null);
    const eligible =
      projection.client.clientType === 'confidential' && projection.client.status !== 'revoked';
    const canUpdate = eligible && options.capabilities.canUpdateClients;
    const canRevoke = eligible && options.capabilities.canRevokeClients;
    const rows: Signal<AdminClientSecret[]> = signal([...projection.secrets]);
    const grid = new DataGrid({
      rows,
      columns: SECRET_COLUMNS,
      zebra: true,
      onSelect: (_index, selected) => selectedSecretId.set(selected.id),
    });
    const generate = action(
      '~G~enerate',
      { kind: 'generate-secret', clientId: projection.client.id },
      12,
      !canUpdate,
    );
    const revoke = fixed(
      new Button('~R~evoke', {
        disabled: () => {
          const selected = projection.secrets.find((secret) => secret.id === selectedSecretId());
          return !canRevoke || selected?.status !== 'active';
        },
        onClick: () => {
          const secretId = selectedSecretId.peek();
          if (secretId) options.onIntent({ kind: 'revoke-secret', clientId: projection.client.id, secretId });
        },
      }),
      10,
    );
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(new Text(`Secrets — ${projection.client.clientName}`), 1),
          projection.secrets[0] && fixed(new Text(`Selected secret: ${projection.secrets[0].label ?? projection.secrets[0].id}`), 1),
          statusRow(status),
          fixed(new Text('Generate a modern secret for a legacy-only client before authentication.'), 1),
          grow(projection.secrets.length > 0 ? grid : new Text('No client secrets')),
          fixed(row({ gap: 1 }, action('~B~ack', { kind: 'select', clientId: projection.client.id }, 9), generate, revoke, spacer()), 2),
        ),
      ),
    );
    currentFocus = projection.secrets.length > 0 ? grid.rows : generate;
  };

  /** Converts a legacy retained list into the current explicit list projection. */
  const normalizePrevious = (
    previous: AdminClientProjection | readonly AdminClient[],
    organizationId: string,
  ): AdminClientProjection =>
    Array.isArray(previous)
      ? { kind: 'list', organizationId, clients: previous }
      : (previous as AdminClientProjection);

  /** Rebuilds content so removed views cannot leave terminal artifacts. */
  const render = (): void => {
    for (const child of [...content.children]) content.remove(child);
    currentFocus = null;
    if (disposed) return;
    if (!options.organization) {
      const disabled = new Button('~C~reate', { disabled: true });
      content.add(
        cover(
          col(
            { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
            fixed(new Text('OIDC Clients'), 1),
            fixed(new Text('organization required'), 1),
            fixed(disabled, 11),
            spacer(),
          ),
        ),
      );
      return;
    }
    if (state.kind === 'closed') {
      content.add(cover(col({ gap: 1 }, fixed(new Text('OIDC Clients'), 1), spacer())));
      return;
    }
    if (state.kind === 'list') return renderList(state);
    if (state.kind === 'detail') return renderDetail(state);
    if (state.kind === 'secrets') return renderSecrets(state);
    const label = state.kind === 'loading'
      ? 'Loading OIDC clients…'
      : state.kind === 'indeterminate'
        ? 'The operation outcome is unknown; reload is required'
        : FAILURE_LABELS[state.failure];
    if (state.previous) {
      const previous = normalizePrevious(state.previous, state.organizationId);
      const status = { label, retry: state.kind !== 'loading' };
      if (previous.kind === 'list') renderList(previous, status);
      else if (previous.kind === 'detail') renderDetail(previous, status);
      else renderSecrets(previous, status);
      return;
    }
    const retry = new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) });
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(new Text(`OIDC Clients — ${options.organization.name}`), 1),
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
      focusedClientId = null;
      render();
    },
    dispose() {
      if (disposed) return;
      state = { kind: 'closed' };
      focusedClientId = null;
      render();
      disposed = true;
    },
  };
}
