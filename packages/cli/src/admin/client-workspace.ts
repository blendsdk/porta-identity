/** Direct JSVision workspace for clients owned by the selected organization. */

import {
  Button,
  col,
  cover,
  DataGrid,
  Dialog,
  fixed,
  GroupBox,
  grow,
  ListBox,
  row,
  Scroller,
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
  | { readonly kind: 'edit-name'; readonly clientId: string }
  | { readonly kind: 'edit'; readonly clientId: string; readonly tab: AdminClientConfigurationTab }
  | { readonly kind: 'activate'; readonly clientId: string }
  | { readonly kind: 'deactivate'; readonly clientId: string }
  | { readonly kind: 'delete'; readonly clientId: string }
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
  readonly content: View;
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
function applicationLabel(client: AdminClient, options: AdminClientWorkspaceOptions): string {
  if (!options.capabilities.canReadApplications) return client.applicationId;
  return (
    options.applications.find((application) => application.id === client.applicationId)?.name ??
    client.applicationId
  );
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

/** Labels owned by the single persistent detail-section selector. */
const CLIENT_DETAIL_SECTIONS = [
  'Overview',
  'Authentication',
  'Protocol',
  'Login experience',
  'Credentials',
  'Lifecycle',
] as const;

/** Maximized workspace dialog that asks its owner to recompute responsive composition on resize. */
class ClientWorkspaceDialog extends Dialog {
  /** Rebuilds only the current projection after the desktop changes size. */
  onWorkspaceResize?: () => void;

  /** Keeps the selected detail section while switching between rail and stacked geometry. */
  override onResized(): void {
    super.onResized();
    this.onWorkspaceResize?.();
  }
}

/** Creates the feature-specific client workspace with ordinary Layout DSL primitives. */
export function createAdminClientWorkspace(
  options: AdminClientWorkspaceOptions,
): AdminClientWorkspace {
  const content = new ClientWorkspaceDialog({ title: 'OIDC Clients', width: 72, height: 20 });
  content.closable = false;
  content.resizable = false;
  content.zoomable = false;
  content.background = 'dialog';
  let state: AdminClientViewState = { kind: 'closed' };
  let currentFocus: View | null = null;
  let focusedClientId: string | null = null;
  let detailClientId: string | null = null;
  const selectedSection = signal(0);
  const focusedSection = signal(0);
  const selectedSecretId = signal<string | null>(null);
  let updateDetailSection: (() => void) | undefined;
  let disposed = false;

  /** Reports when the maximized workspace needs its narrow stacked detail composition. */
  const isCompact = (): boolean => {
    // During a desktop resize the window rect is current before the next reflow updates `bounds`.
    // Reading the rect first lets the responsive composition switch in that same resize cycle.
    const width = content.layout.rect?.width ?? (content.bounds.width || 74);
    const height = content.layout.rect?.height ?? (content.bounds.height || 18);
    return width < 60 || height < 15;
  };

  /** Creates an action button whose natural size is resolved by its Layout DSL row. */
  const action = (
    label: string,
    intent: AdminClientIntent,
    disabled: boolean | (() => boolean) = false,
  ): Button => new Button(label, { disabled, onClick: () => options.onIntent(intent) });

  /** Adds a compact status row when a retained projection is loading or failed. */
  const statusRow = (status: ProjectionStatus | undefined): View | undefined => {
    if (!status) return undefined;
    const retry = status.retry
      ? new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) })
      : undefined;
    if (retry) currentFocus = retry;
    return fixed(row({ gap: 1 }, grow(new Text(status.label)), retry), 2);
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
      fixed(
        new Text(`OIDC Clients — ${options.organization?.name ?? 'organization required'}`),
        40,
      ),
      spacer(),
      create,
    );
    let body: View;
    if (projection.clients.length === 0) {
      body = new Text('No OIDC clients');
      currentFocus = canCreate ? create : null;
    } else {
      const rows: Signal<AdminClient[]> = signal([...projection.clients]);
      const focused = signal(
        Math.max(
          0,
          projection.clients.findIndex((item) => item.id === focusedClientId),
        ),
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
    const denial =
      options.organization?.status !== 'active'
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
    const clientSummary = firstClient ? `Client: ${firstClient.clientName}` : undefined;
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(heading, 2),
          statusRow(status),
          denial && fixed(new Text(denial), 1),
          clientSummary ? fixed(new Text(clientSummary), 1) : undefined,
          applicationSummary ? fixed(new Text(applicationSummary), 1) : undefined,
          grow(body),
        ),
      ),
    );
  };

  /** Wraps one logical detail region in the established framed surface. */
  const region = (title: string, child: View): GroupBox => {
    const box = new GroupBox({ title });
    box.add(cover(child));
    return box;
  };

  /** Produces a concise, read-only Overview while keeping name editing focused. */
  const overviewSection = (
    projection: Exclude<AdminClientProjection, { kind: 'list' }>,
    application: string,
  ): View => {
    const selected = projection.client;
    const identity = region(
      'Identity',
      new Text(
        [
          selected.clientName,
          selected.clientId,
          `${selected.clientType} · ${selected.applicationType}`,
          `Status: ${selected.status}`,
          selected.createdAt,
          selected.updatedAt,
        ].join('\n'),
      ),
    );
    const context = region(
      'Context',
      new Text(
        [
          options.organization?.name ?? projection.organizationId,
          application,
          `Auth: ${selected.tokenEndpointAuthMethod}`,
          `Login override: ${selected.loginMethods?.join(', ') ?? 'inherit'}`,
        ].join('\n'),
      ),
    );
    const protocol = region('Protocol summary', new Text(selected.grantTypes.join(' · ')));
    const login = region('Login summary', new Text(selected.effectiveLoginMethods.join(' · ')));
    return col(
      { gap: 1 },
      fixed(row({ gap: 1 }, grow(identity), grow(context)), 8),
      grow(row({ gap: 1 }, grow(protocol), grow(login))),
      fixed(
        row(
          { gap: 1 },
          action(
            '~E~dit name',
            { kind: 'edit-name', clientId: selected.id },
            !options.capabilities.canUpdateClients,
          ),
          spacer(),
        ),
        2,
      ),
    );
  };

  /** Shows redirect and browser-origin collections with one focused entry action. */
  const authenticationSection = (
    projection: Exclude<AdminClientProjection, { kind: 'list' }>,
  ): View => {
    const selected = projection.client;
    return col(
      { gap: 1 },
      grow(region('Redirect URIs', new Text(selected.redirectUris.join('\n') || 'None'))),
      grow(
        region(
          'Post-logout redirect URIs',
          new Text(selected.postLogoutRedirectUris.join('\n') || 'None'),
        ),
      ),
      grow(region('Allowed origins', new Text(selected.allowedOrigins.join('\n') || 'None'))),
      fixed(
        row(
          { gap: 1 },
          action(
            '~E~dit authentication',
            { kind: 'edit', clientId: selected.id, tab: 'Redirects' },
            !options.capabilities.canUpdateClients,
          ),
          spacer(),
        ),
        2,
      ),
    );
  };

  /** Shows the effective protocol values with one focused entry action. */
  const protocolSection = (projection: Exclude<AdminClientProjection, { kind: 'list' }>): View => {
    const selected = projection.client;
    const details = [
      `Grant types: ${selected.grantTypes.join(', ')}`,
      `Response types: ${selected.responseTypes.join(', ')}`,
      `Scope: ${selected.scope}`,
      `Token authentication: ${selected.tokenEndpointAuthMethod}`,
      `PKCE required: ${selected.requirePkce ? 'yes' : 'no'}`,
    ];
    return col(
      { gap: 1 },
      grow(region('Protocol configuration', new Text(details.join('\n')))),
      fixed(
        row(
          { gap: 1 },
          action(
            '~E~dit protocol',
            { kind: 'edit', clientId: selected.id, tab: 'Protocol' },
            !options.capabilities.canUpdateClients,
          ),
          spacer(),
        ),
        2,
      ),
    );
  };

  /** Shows inherited and effective login methods with one focused entry action. */
  const loginSection = (projection: Exclude<AdminClientProjection, { kind: 'list' }>): View => {
    const selected = projection.client;
    const details = [
      `Override mode: ${selected.loginMethods === null ? 'Inherit' : 'Custom'}`,
      `Source organization: ${options.organization?.name ?? projection.organizationId}`,
      `Configured methods: ${selected.loginMethods?.join(', ') ?? 'inherit'}`,
      `Effective methods: ${selected.effectiveLoginMethods.join(', ')}`,
    ];
    return col(
      { gap: 1 },
      grow(region('Login experience', new Text(details.join('\n')))),
      fixed(
        row(
          { gap: 1 },
          action(
            '~E~dit login experience',
            { kind: 'edit', clientId: selected.id, tab: 'Login' },
            !options.capabilities.canUpdateClients,
          ),
          spacer(),
        ),
        2,
      ),
    );
  };

  /** Renders metadata-only client secrets and selection-dependent operations. */
  const credentialsSection = (
    projection: Exclude<AdminClientProjection, { kind: 'list' }>,
  ): View => {
    const selected = projection.client;
    const currentSecret = projection.secrets.find(
      (secret) => secret.id === selectedSecretId.peek(),
    );
    if (!currentSecret) selectedSecretId.set(projection.secrets[0]?.id ?? null);
    const rows: Signal<AdminClientSecret[]> = signal([...projection.secrets]);
    const focused = signal(
      Math.max(
        0,
        projection.secrets.findIndex((secret) => secret.id === selectedSecretId.peek()),
      ),
    );
    const grid = new DataGrid({
      rows,
      focused,
      columns: SECRET_COLUMNS,
      zebra: true,
      onSelect: (_index, secret) => selectedSecretId.set(secret.id),
    });
    const actions: View[] = [];
    if (selected.clientType === 'confidential') {
      actions.push(
        action(
          '~G~enerate',
          { kind: 'generate-secret', clientId: selected.id },
          !options.capabilities.canUpdateClients,
        ),
      );
      actions.push(
        new Button('~R~evoke', {
          disabled: () => {
            const secret = projection.secrets.find(
              (candidate) => candidate.id === selectedSecretId(),
            );
            return !options.capabilities.canRevokeClientSecrets || secret?.status !== 'active';
          },
          onClick: () => {
            const secretId = selectedSecretId.peek();
            if (secretId)
              options.onIntent({ kind: 'revoke-secret', clientId: selected.id, secretId });
          },
        }),
      );
    }
    const credentials = region('Credentials', grid);
    return col(
      { gap: 1 },
      selected.clientType === 'public' &&
        fixed(new Text('Public clients do not use client secrets.'), 1),
      grow(credentials),
      fixed(row({ gap: 1 }, ...actions, spacer()), 2),
    );
  };

  /** Keeps lifecycle operations together and separate from workspace navigation. */
  const lifecycleSection = (projection: Exclude<AdminClientProjection, { kind: 'list' }>): View => {
    const selected = projection.client;
    const lifecycle =
      selected.status === 'inactive'
        ? action(
            '~A~ctivate',
            { kind: 'activate', clientId: selected.id },
            !options.capabilities.canUpdateClients,
          )
        : action(
            '~D~eactivate',
            { kind: 'deactivate', clientId: selected.id },
            !options.capabilities.canUpdateClients,
          );
    return col(
      { gap: 1 },
      grow(
        region(
          'Lifecycle',
          new Text(
            `Status: ${selected.status}\nDeleting this client permanently removes its protocol authority and secrets.`,
          ),
        ),
      ),
      fixed(
        row(
          { gap: 1 },
          lifecycle,
          action(
            'Delete',
            { kind: 'delete', clientId: selected.id },
            !options.capabilities.canDeleteClients,
          ),
          spacer(),
        ),
        2,
      ),
    );
  };

  /** Renders one selected client through stable responsive section navigation. */
  const renderDetail = (
    projection: Exclude<AdminClientProjection, { kind: 'list' }>,
    status?: ProjectionStatus,
  ): void => {
    const selected = projection.client;
    const clientChanged = detailClientId !== selected.id;
    if (clientChanged) {
      detailClientId = selected.id;
      selectedSecretId.set(null);
      const sectionIndex = projection.kind === 'secrets' ? 4 : 0;
      selectedSection.set(sectionIndex);
      focusedSection.set(sectionIndex);
    }
    const application = options.capabilities.canReadApplications
      ? (projection.applicationName ?? applicationLabel(selected, options))
      : selected.applicationId;
    /** Builds only the currently selected section from this authoritative projection. */
    const selectedContent = (): GroupBox => {
      const index = Math.max(
        0,
        Math.min(selectedSection.peek(), CLIENT_DETAIL_SECTIONS.length - 1),
      );
      if (index === 0) return region('Overview', overviewSection(projection, application));
      if (index === 1) return region('Authentication', authenticationSection(projection));
      if (index === 2) return region('Protocol', protocolSection(projection));
      if (index === 3) return region('Login experience', loginSection(projection));
      if (index === 4) return region('Credentials', credentialsSection(projection));
      return region('Lifecycle', lifecycleSection(projection));
    };
    let section = selectedContent();
    const compact = isCompact();
    const back = action('~B~ack to OIDC clients', { kind: 'back' });
    const sectionScroller = compact
      ? new Scroller({
          content: grow(section),
          extent: () => ({
            width: Math.max(1, (content.layout.rect?.width ?? content.bounds.width) - 6),
            height: 18,
          }),
          scrollbars: 'vertical',
        })
      : undefined;
    const detailBody = compact
      ? col(
          fixed(row({ gap: 1 }, grow(sectionNavigation), back), 2),
          grow(sectionScroller ?? section),
        )
      : row({ gap: 1 }, fixed(sectionNavigation, 19), grow(section));
    updateDetailSection = () => {
      const nextSection = selectedContent();
      if (sectionScroller) {
        sectionScroller.remove(section);
        sectionScroller.add(grow(nextSection));
      } else {
        detailBody.remove(section);
        detailBody.add(grow(nextSection));
      }
      section = nextSection;
    };
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          statusRow(status),
          grow(detailBody),
          !compact && fixed(row({ gap: 1 }, back, spacer()), 2),
        ),
      ),
    );
    currentFocus = sectionNavigation.rows;
  };

  /** One selector instance retains focus and selection across detail redraws and viewport changes. */
  const sectionNavigation = new ListBox({
    items: signal([...CLIENT_DETAIL_SECTIONS]),
    focused: focusedSection,
    selected: selectedSection,
    onSelect: (index) => {
      selectedSection.set(index);
      focusedSection.set(index);
      const projection = state.kind === 'detail' || state.kind === 'secrets' ? state : undefined;
      updateDetailSection?.();
      options.focusView?.(sectionNavigation.rows);
      if (index === 4 && projection?.client.clientType === 'confidential')
        options.onIntent({ kind: 'secrets', clientId: projection.client.id });
    },
  });

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
            row(disabled, spacer()),
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
    if (state.kind === 'list') {
      detailClientId = null;
      return renderList(state);
    }
    if (state.kind === 'detail') return renderDetail(state);
    if (state.kind === 'secrets') return renderDetail(state);
    const label =
      state.kind === 'loading'
        ? 'Loading OIDC clients…'
        : state.kind === 'indeterminate'
          ? 'The operation outcome is unknown; reload is required'
          : FAILURE_LABELS[state.failure];
    if (state.previous) {
      const previous = normalizePrevious(state.previous, state.organizationId);
      const status = { label, retry: state.kind !== 'loading' };
      if (previous.kind === 'list') renderList(previous, status);
      else if (previous.kind === 'detail') renderDetail(previous, status);
      else renderDetail(previous, status);
      return;
    }
    const retry = new Button('~R~etry', { onClick: () => options.onIntent({ kind: 'retry' }) });
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          fixed(new Text(`OIDC Clients — ${options.organization.name}`), 1),
          fixed(new Text(label), 1),
          state.kind !== 'loading' && row(retry, spacer()),
          spacer(),
        ),
      ),
    );
    if (state.kind !== 'loading') currentFocus = retry;
  };

  content.onWorkspaceResize = render;

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
      detailClientId = null;
      selectedSecretId.set(null);
      render();
    },
    dispose() {
      if (disposed) return;
      state = { kind: 'closed' };
      focusedClientId = null;
      detailClientId = null;
      selectedSecretId.set(null);
      render();
      disposed = true;
    },
  };
}
