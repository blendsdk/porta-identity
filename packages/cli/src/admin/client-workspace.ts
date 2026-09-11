/** Direct JSVision workspace for clients owned by the selected organization. */

import type { UpdateClientInput } from '@portaidentity/sdk';
import {
  Button,
  CheckGroup,
  col,
  cover,
  DataGrid,
  Dialog,
  fixed,
  Group,
  GroupBox,
  grow,
  Input,
  Label,
  RadioGroup,
  row,
  signal,
  spacer,
  Switch,
  TabView,
  Text,
  View,
} from '@jsvision/ui';
import type { Column, Signal, Tab } from '@jsvision/ui';

import { formatAdminDateTime, formatOptionalAdminDateTime } from './admin-date-time.js';
import type { AdminApplication } from './application-state.js';
import { authenticationUrlRows } from './client-authentication-dialog.js';
import type { AdminAuthenticationUrlRow } from './client-authentication-dialog.js';
import type {
  AdminClient,
  AdminClientProjection,
  AdminClientSecret,
  AdminClientViewState,
} from './client-state.js';
import { SelectableReadOnlyInput } from './selectable-read-only-input.js';
import type { AdminCapabilities, AdminOrganizationContext } from './state.js';
import { textValidator } from './user-dialog-fields.js';

/** Closed set of intents emitted by the organization client workspace. */
export type AdminClientIntent =
  | { readonly kind: 'create' }
  | { readonly kind: 'select'; readonly clientId: string }
  | { readonly kind: 'retry' }
  | { readonly kind: 'back' }
  | { readonly kind: 'edit-name'; readonly clientId: string }
  | { readonly kind: 'add-authentication-url'; readonly clientId: string }
  | {
      readonly kind: 'edit-authentication-url';
      readonly clientId: string;
      readonly row: AdminAuthenticationUrlRow;
    }
  | {
      readonly kind: 'delete-authentication-url';
      readonly clientId: string;
      readonly row: AdminAuthenticationUrlRow;
    }
  | {
      readonly kind: 'save-protocol';
      readonly clientId: string;
      readonly input: UpdateClientInput;
    }
  | {
      readonly kind: 'save-login';
      readonly clientId: string;
      readonly input: UpdateClientInput;
    }
  | { readonly kind: 'activate'; readonly clientId: string }
  | { readonly kind: 'deactivate'; readonly clientId: string }
  | { readonly kind: 'delete'; readonly clientId: string }
  | { readonly kind: 'secrets'; readonly clientId: string }
  | { readonly kind: 'generate-secret'; readonly clientId: string }
  | { readonly kind: 'delete-secret'; readonly clientId: string; readonly secretId: string };

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

/** Builds the compact identity and status columns used by the client overview. */
function clientColumns(options: AdminClientWorkspaceOptions): Column<AdminClient>[] {
  return [
    { title: 'Name', accessor: (client) => client.clientName, width: '2fr', minWidth: 16 },
    { title: 'Client ID', accessor: (client) => client.clientId, width: '2fr', minWidth: 16 },
    {
      title: 'Application',
      accessor: (client) => applicationLabel(client, options),
      width: '2fr',
      minWidth: 16,
    },
    { title: 'Status', accessor: (client) => client.status, width: 10 },
  ];
}

/** Metadata-only columns used by secret management. */
const SECRET_COLUMNS: Column<AdminClientSecret>[] = [
  { title: 'Label', accessor: (secret) => secret.label ?? 'Not provided', width: 14 },
  { title: 'Status', accessor: (secret) => secret.status, width: 8 },
  {
    title: 'Last used',
    accessor: (secret) => formatOptionalAdminDateTime(secret.lastUsedAt, 'Never'),
    width: 23,
  },
  {
    title: 'Expires',
    accessor: (secret) => formatOptionalAdminDateTime(secret.expiresAt, 'Never'),
    width: 23,
  },
  { title: 'Created', accessor: (secret) => formatAdminDateTime(secret.createdAt), width: 23 },
];

/** Optional operation status shown without obscuring retained validated content. */
interface ProjectionStatus {
  /** Safe fixed status label. */
  readonly label: string;
  /** Whether deliberate authoritative reload is available. */
  readonly retry: boolean;
}

/** Labels for the client subviews shown by the detail tab pane. */
const CLIENT_DETAIL_SECTIONS = [
  'Overview',
  'Authentication',
  'Protocol',
  'Login experience',
  'Credentials',
  'Lifecycle',
] as const;

/** Returns true for bounded scope text that cannot alter terminal rendering. */
function validScope(value: string): boolean {
  if (value.length > 2_048) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Returns whether the selected protocol combination matches server compatibility rules. */
function protocolIsValid(
  client: AdminClient,
  grants: readonly boolean[],
  authenticationMethod: number,
  requirePkce: boolean,
  scope: string,
): boolean {
  if (!grants.some(Boolean) || !validScope(scope)) return false;
  if (client.clientType === 'public') {
    return authenticationMethod === 2 && requirePkce && !grants[1];
  }
  return authenticationMethod !== 2;
}

/** Creates the feature-specific client workspace with ordinary Layout DSL primitives. */
export function createAdminClientWorkspace(
  options: AdminClientWorkspaceOptions,
): AdminClientWorkspace {
  const content = new Dialog({ title: 'OIDC Clients', width: 72, height: 20 });
  content.closable = false;
  content.resizable = false;
  content.zoomable = false;
  content.background = 'dialog';
  let state: AdminClientViewState = { kind: 'closed' };
  let currentFocus: View | null = null;
  let focusedClientId: string | null = null;
  let detailClientId: string | null = null;
  const selectedSection = signal(0);
  const selectedSecretId = signal<string | null>(null);
  let disposed = false;

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
    currentFocus = projection.clients.length > 0 ? grid.rows : null;
    const clientCount = projection.clients.length;
    const footer =
      clientCount === 0
        ? canCreate
          ? 'No OIDC clients. Use OIDC Clients > Create client.'
          : 'No OIDC clients'
        : `↑↓ Move · Enter View details · ${clientCount} ${clientCount === 1 ? 'client' : 'clients'}`;
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          statusRow(status),
          grow(grid),
          fixed(new Text(footer), 1),
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
    const clientId = new SelectableReadOnlyInput(selected.clientId);
    const identity = region(
      'Identity',
      col(
        fixed(new Text(`Client name: ${selected.clientName}`), 1),
        fixed(row({ gap: 1 }, fixed(new Label('Client ID', clientId), 9), grow(clientId)), 1),
        fixed(new Text(`Client type: ${selected.clientType}`), 1),
        fixed(new Text(`Status: ${selected.status}`), 1),
        fixed(new Text(`Created: ${formatAdminDateTime(selected.createdAt)}`), 1),
        fixed(new Text(`Updated: ${formatAdminDateTime(selected.updatedAt)}`), 1),
      ),
    );
    const context = region(
      'Context',
      new Text(
        [
          `Organization: ${options.organization?.name ?? projection.organizationId}`,
          `Application: ${application}`,
          `Application type: ${selected.applicationType}`,
          `Authentication: ${selected.tokenEndpointAuthMethod}`,
          `Login methods: ${selected.loginMethods?.join(', ') ?? 'inherit'}`,
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

  /** Shows all redirect and browser-origin collections in one direct CRUD grid. */
  const authenticationSection = (
    projection: Exclude<AdminClientProjection, { kind: 'list' }>,
  ): View => {
    const selected = projection.client;
    const rows = signal(authenticationUrlRows(selected));
    const focused = signal(0);
    const selectedIndex = signal(-1);
    const selectedRow = signal<AdminAuthenticationUrlRow | null>(null);
    const grid = new DataGrid<AdminAuthenticationUrlRow>({
      rows,
      focused,
      selected: selectedIndex,
      columns: [
        { title: 'Type', accessor: (entry) => entry.type, width: 27 },
        { title: 'URL / origin', accessor: (entry) => entry.value, width: '1fr', minWidth: 20 },
      ],
      zebra: true,
      onSelect: (index, entry) => {
        selectedIndex.set(index);
        selectedRow.set(entry);
      },
    });
    const edit = new Button('Edit', {
      disabled: () => !options.capabilities.canUpdateClients || selectedRow() === null,
      onClick: () => {
        const target = selectedRow.peek();
        if (target)
          options.onIntent({ kind: 'edit-authentication-url', clientId: selected.id, row: target });
      },
    });
    const remove = new Button('Delete', {
      disabled: () => {
        const target = selectedRow();
        return !options.capabilities.canUpdateClients || target === null ||
          (target.kind === 'redirect' && selected.redirectUris.length === 1);
      },
      onClick: () => {
        const target = selectedRow.peek();
        if (target)
          options.onIntent({ kind: 'delete-authentication-url', clientId: selected.id, row: target });
      },
    });
    return col(
      { gap: 1, padding: 1 },
      grow(grid),
      fixed(
        row(
          { gap: 1 },
          action('Add', { kind: 'add-authentication-url', clientId: selected.id },
            !options.capabilities.canUpdateClients),
          edit,
          remove,
          spacer(),
        ),
        2,
      ),
    );
  };

  /** Edits and saves protocol values directly inside the Protocol tab. */
  const protocolSection = (projection: Exclude<AdminClientProjection, { kind: 'list' }>): View => {
    const selected = projection.client;
    const grantNames = ['authorization_code', 'client_credentials', 'refresh_token'] as const;
    const authenticationNames = ['client_secret_basic', 'client_secret_post', 'none'] as const;
    const initialGrants = grantNames.map((grant) => selected.grantTypes.includes(grant));
    const initialAuthentication = authenticationNames.indexOf(selected.tokenEndpointAuthMethod);
    const grants = signal([...initialGrants]);
    const authenticationMethod = signal(initialAuthentication);
    const requirePkce = signal(selected.requirePkce);
    const scope = signal(selected.scope);
    const submitted = signal(false);
    const grantChoices = new CheckGroup({
      labels: ['Authorization code', 'Client credentials', 'Refresh token'],
      value: grants,
    });
    const scopeInput = new Input({
      value: scope,
      maxLength: 2_048,
      validator: textValidator(0, 2_048),
    });
    const authenticationChoices: View =
      selected.clientType === 'public'
        ? new Text('None (required, read only)')
        : new RadioGroup({
            labels: ['Client secret basic', 'Client secret post'],
            value: authenticationMethod,
          });
    const pkceSwitch = new Switch({
      value: requirePkce,
      label: '~P~KCE required',
      disabled: selected.clientType === 'public',
    });
    const isValid = (): boolean =>
      protocolIsValid(
        selected,
        grants(),
        authenticationMethod(),
        requirePkce(),
        scope(),
      );
    const isDirty = (): boolean =>
      grants().some((value, index) => value !== initialGrants[index]) ||
      authenticationMethod() !== initialAuthentication ||
      requirePkce() !== selected.requirePkce ||
      scope() !== selected.scope;
    const save = new Button('~S~ave', {
      disabled: () =>
        !options.capabilities.canUpdateClients || submitted() || !isValid() || !isDirty(),
      onClick: () => {
        submitted.set(true);
        options.onIntent({
          kind: 'save-protocol',
          clientId: selected.id,
          input: {
            grantTypes: grants
              .peek()
              .flatMap((enabled, index) => (enabled ? [grantNames[index]!] : [])),
            responseTypes: ['code'],
            scope: scope.peek(),
            tokenEndpointAuthMethod: authenticationNames[authenticationMethod.peek()]!,
            requirePkce: requirePkce.peek(),
          },
        });
      },
    });
    const form = col(
      { gap: 1 },
      fixed(
        row(
          { gap: 1 },
          grow(new Text(`Client type: ${selected.clientType} (read only)`)),
          grow(new Text('Response type: code (read only)')),
        ),
        1,
      ),
      fixed(
        row(
          { gap: 2 },
          grow(col({}, fixed(new Text('Grant types'), 1), fixed(grantChoices, 3))),
          grow(
            col(
              {},
              fixed(new Text('Token endpoint authentication'), 1),
              fixed(authenticationChoices, 3),
            ),
          ),
        ),
        4,
      ),
      fixed(row({ gap: 1 }, fixed(new Label('Scope', scopeInput), 18), grow(scopeInput)), 1),
      fixed(
        row(
          { gap: 2 },
          pkceSwitch,
          grow(
            new Text(() =>
              isValid() ? '' : 'Not supported for this client type.',
            ),
          ),
        ),
        2,
      ),
    );
    return col(
      { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
      grow(form),
      fixed(row({ gap: 1 }, save, spacer()), 2),
    );
  };

  /** Edits and saves inherited or explicit login methods directly inside the tab. */
  const loginSection = (projection: Exclude<AdminClientProjection, { kind: 'list' }>): View => {
    const selected = projection.client;
    const initiallyInherited = selected.loginMethods === null;
    const inherited = signal(initiallyInherited);
    const initialMethods = selected.loginMethods ?? selected.effectiveLoginMethods;
    const initialSelection = [
      initialMethods.includes('password'),
      initialMethods.includes('magic_link'),
    ];
    const methods = signal([...initialSelection]);
    const submitted = signal(false);
    const methodChoices = new CheckGroup({
      labels: ['~P~assword', '~M~agic link'],
      value: methods,
    });
    const canSave = (): boolean => inherited() || methods().some(Boolean);
    const isDirty = (): boolean =>
      inherited() !== initiallyInherited ||
      (!inherited() && methods().some((value, index) => value !== initialSelection[index]));
    const form = col(
      { gap: 1 },
      fixed(
        new Text(`Organization defaults: ${options.organization?.name ?? projection.organizationId}`),
        1,
      ),
      fixed(
        new Text(
          `Effective methods: ${selected.effectiveLoginMethods
            .map((method) => (method === 'magic_link' ? 'Magic link' : 'Password'))
            .join(', ')}`,
        ),
        1,
      ),
      fixed(new Switch({ value: inherited, label: 'Use organization defaults' }), 1),
      fixed(new Text('Client login methods'), 1),
      fixed(methodChoices, 2),
      fixed(
        new Text(() => (canSave() ? '' : 'Select Password, Magic link, or both before saving.')),
        2,
      ),
    );
    let wasInherited = inherited.peek();
    form.onMount(() => {
      form.bind(
        () => inherited(),
        (usesDefaults) => {
          methodChoices.focusable = !usesDefaults;
          methodChoices.setItemEnabled(0, !usesDefaults);
          methodChoices.setItemEnabled(1, !usesDefaults);
          if (wasInherited && !usesDefaults) methods.set([false, false]);
          if (usesDefaults) {
            methods.set([
              selected.effectiveLoginMethods.includes('password'),
              selected.effectiveLoginMethods.includes('magic_link'),
            ]);
          }
          wasInherited = usesDefaults;
        },
        { relayout: true },
      );
    });
    methodChoices.focusable = !inherited.peek();
    methodChoices.setItemEnabled(0, !inherited.peek());
    methodChoices.setItemEnabled(1, !inherited.peek());
    const save = new Button('~S~ave', {
      disabled: () =>
        !options.capabilities.canUpdateClients || submitted() || !canSave() || !isDirty(),
      onClick: () => {
        submitted.set(true);
        const selectedMethods = methods.peek();
        options.onIntent({
          kind: 'save-login',
          clientId: selected.id,
          input: {
            loginMethods: inherited.peek()
              ? null
              : [
                  selectedMethods[0] ? 'password' : null,
                  selectedMethods[1] ? 'magic_link' : null,
                ].filter(
                  (method): method is 'password' | 'magic_link' => method !== null,
                ),
          },
        });
      },
    });
    return col(
      { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
      grow(form),
      fixed(row({ gap: 1 }, save, spacer()), 2),
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
          'A~d~d',
          { kind: 'generate-secret', clientId: selected.id },
          !options.capabilities.canUpdateClients,
        ),
      );
      actions.push(
        new Button('D~e~lete', {
          disabled: () => {
            const secret = projection.secrets.find(
              (candidate) => candidate.id === selectedSecretId(),
            );
            return !options.capabilities.canRevokeClientSecrets || !secret;
          },
          onClick: () => {
            const secretId = selectedSecretId.peek();
            if (secretId)
              options.onIntent({ kind: 'delete-secret', clientId: selected.id, secretId });
          },
        }),
      );
    }
    return col(
      { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
      selected.clientType === 'public' &&
        fixed(new Text('Public clients do not use client secrets.'), 1),
      grow(grid),
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
      { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
      fixed(new Text(`Current status: ${selected.status}`), 1),
      fixed(
        new Text(
          selected.status === 'active'
            ? 'Deactivation stops new sign-ins. The client can be activated again later.'
            : 'Activation allows this client to start new sign-ins again.',
        ),
        2,
      ),
      fixed(
        new Text('Deleting this client permanently removes its protocol authority and secrets.'),
        2,
      ),
      spacer(),
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

  /** Renders one selected client in a full-width tab pane. */
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
    }
    const application = options.capabilities.canReadApplications
      ? (projection.applicationName ?? applicationLabel(selected, options))
      : selected.applicationId;
    const back = action('~B~ack to OIDC clients', { kind: 'back' });
    /** Wraps a subview in the Group required by TabView. */
    const tabPage = (child: View): Group => {
      const page = new Group();
      page.add(cover(child));
      return page;
    };
    const pages = [
      overviewSection(projection, application),
      authenticationSection(projection),
      protocolSection(projection),
      loginSection(projection),
      credentialsSection(projection),
      lifecycleSection(projection),
    ];
    const tabs = signal<Tab[]>(
      CLIENT_DETAIL_SECTIONS.map((title, index) => ({ title, content: tabPage(pages[index]!) })),
    );
    const tabView = new TabView({
      tabs,
      active: selectedSection,
      onChange: (index) => {
        if (index === 4 && projection.client.clientType === 'confidential')
          options.onIntent({ kind: 'secrets', clientId: projection.client.id });
      },
    });
    content.add(
      cover(
        col(
          { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
          statusRow(status),
          grow(tabView),
          fixed(row({ gap: 1 }, back, spacer()), 2),
        ),
      ),
    );
    currentFocus = tabView.strip;
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
      content.add(
        cover(
          col(
            { gap: 1, padding: { top: 0, right: 1, bottom: 0, left: 1 } },
            fixed(new Text('organization required'), 1),
            spacer(),
          ),
        ),
      );
      return;
    }
    if (state.kind === 'closed') {
      content.add(cover(spacer()));
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
