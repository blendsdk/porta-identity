/** Movable Layout DSL dialogs for selected-organization OIDC client administration. */

import type {
  CreateClientInput,
  GenerateSecretInput,
  UpdateClientInput,
} from '@portaidentity/sdk';
import {
  Button,
  CheckGroup,
  col,
  ComboBox,
  Commands,
  cover,
  DataGrid,
  Dialog,
  fixed,
  grow,
  Group,
  Input,
  Label,
  RadioGroup,
  row,
  Scroller,
  signal,
  spacer,
  Switch,
  TabView,
  Text,
} from '@jsvision/ui';
import type {
  Column,
  EventLoop,
  ModalDialogHost,
  Signal,
  Tab,
} from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminApplication } from './application-state.js';
import type { AdminClientConfigurationTab } from './client-workspace.js';
import type {
  AdminClient,
  AdminClientSecret,
} from './client-state.js';
import type { AdminOrganizationContext } from './state.js';
import { textValidator } from './user-dialog-fields.js';

/** Modal host needed for abort-driven client dialog closure. */
export interface AdminClientDialogHost extends ModalDialogHost {
  /** Event loop that can synchronously close and focus the owned modal. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Configuration dialog entry options. */
export type ClientConfigurationDialogOptions =
  | {
      readonly mode: 'create';
      readonly organization: AdminOrganizationContext;
      readonly applications: readonly AdminApplication[];
      readonly initialTab: 'Basic';
    }
  | {
      readonly mode: 'edit';
      readonly organization: AdminOrganizationContext;
      readonly client: AdminClient;
      readonly initialTab: AdminClientConfigurationTab;
    };

/** Result of the shared create/edit configuration dialog. */
export type ClientConfigurationDialogResult =
  | { readonly kind: 'create'; readonly input: Omit<CreateClientInput, 'organizationId'> }
  | {
      readonly kind: 'update';
      readonly clientId: string;
      readonly input: UpdateClientInput;
    }
  | { readonly kind: 'cancel' };

/** Result of an explicit client lifecycle confirmation. */
export type ClientLifecycleDialogResult =
  | { readonly kind: 'deactivate' | 'revoke'; readonly clientId: string }
  | { readonly kind: 'cancel' };

/** Result of the client-secret generation form. */
export type GenerateClientSecretDialogResult =
  | { readonly kind: 'generate'; readonly clientId: string; readonly input?: GenerateSecretInput }
  | { readonly kind: 'cancel' };

/** Result of a permanent nested-secret revocation confirmation. */
export type RevokeClientSecretDialogResult =
  | { readonly kind: 'revoke-secret'; readonly clientId: string; readonly secretId: string }
  | { readonly kind: 'cancel' };

/** One editable row in a URI or origin collection. */
interface CollectionRow {
  /** Stable row key used only inside the modal. */
  readonly id: string;
  /** Exact collection value. */
  readonly value: string;
}

/** Single column shared by the three collection editors. */
const COLLECTION_COLUMNS: Column<CollectionRow>[] = [
  { title: 'Value', accessor: (entry) => entry.value, width: '1fr', minWidth: 20 },
];

/** DataGrid that keeps complete collection replacement behind one owned signal. */
class CollectionGrid extends DataGrid<CollectionRow> {
  /** Creates the grid over its caller-owned rows. */
  constructor(private readonly values: Signal<CollectionRow[]>, focused: Signal<number>) {
    super({ rows: values, focused, columns: COLLECTION_COLUMNS, zebra: true });
  }

  /** Replaces the complete collection without bypassing submit validation. */
  setRows(rows: CollectionRow[]): void {
    this.values.set([...rows]);
  }
}

/** Mutable signals and controls owned by one configuration dialog. */
interface ClientForm {
  /** Administrative display name. */
  readonly clientName: Signal<string>;
  /** Required redirect URI rows. */
  readonly redirects: Signal<CollectionRow[]>;
  /** Optional post-logout URI rows. */
  readonly logoutRedirects: Signal<CollectionRow[]>;
  /** Optional allowed-origin rows. */
  readonly origins: Signal<CollectionRow[]>;
  /** Optional scope; empty means server default during create. */
  readonly scope: Signal<string>;
  /** Initial secret label used only by confidential create. */
  readonly secretLabel: Signal<string>;
  /** Selected global application during create. */
  readonly application: Signal<AdminApplication | null>;
  /** Public/confidential selection index. */
  readonly clientType: Signal<number>;
  /** Web/native/SPA selection index. */
  readonly applicationType: Signal<number>;
  /** Server-default/custom protocol selection. */
  readonly protocolMode: Signal<number>;
  /** Authorization-code/client-credentials/refresh-token flags. */
  readonly grants: Signal<boolean[]>;
  /** Authentication-method selection. */
  readonly authenticationMethod: Signal<number>;
  /** PKCE selection. */
  readonly requirePkce: Signal<boolean>;
  /** Inherit/password/magic-link/both selection. */
  readonly loginMode: Signal<number>;
  /** Name input used by the modal validity sweep. */
  readonly nameInput: Input;
  /** Scope input used by the modal validity sweep. */
  readonly scopeInput: Input;
  /** Optional initial-label input. */
  readonly secretLabelInput: Input;
}

/** Dialog that validates cross-tab collections and protocol relationships before closing. */
class ClientConfigurationDialog extends Dialog {
  /** Creates a movable dialog over its private form state. */
  constructor(
    title: string,
    width: number,
    height: number,
    private readonly form: ClientForm,
    private readonly creating: boolean,
  ) {
    super({ title, width, height, centered: true });
  }

  /** Rejects invalid hidden-tab values as one complete server-compatible form. */
  valid(command: string): boolean {
    if (command === Commands.cancel) return true;
    const redirects = this.form.redirects.peek().map((entry) => entry.value);
    const logout = this.form.logoutRedirects.peek().map((entry) => entry.value);
    const origins = this.form.origins.peek().map((entry) => entry.value);
    if (
      !validText(this.form.clientName.peek(), 1, 255) ||
      !validCollection(redirects, 1, 10, isRedirectUri) ||
      !validCollection(logout, 0, 10, isRedirectUri) ||
      !validCollection(origins, 0, 10, isOrigin) ||
      !validText(this.form.scope.peek(), 0, 2_048, true) ||
      !validText(this.form.secretLabel.peek(), 0, 255, true) ||
      (this.creating && !this.form.application.peek())
    ) {
      this.firstInvalid = this.form.nameInput;
      return false;
    }
    if (this.form.protocolMode.peek() === 1) {
      const grants = this.form.grants.peek();
      const clientType = this.form.clientType.peek() === 0 ? 'public' : 'confidential';
      const authentication = this.form.authenticationMethod.peek();
      if (
        !grants.some(Boolean) ||
        (clientType === 'public' &&
          (authentication !== 2 || !this.form.requirePkce.peek() || grants[1])) ||
        (clientType === 'confidential' && authentication === 2)
      ) {
        this.firstInvalid = this.form.scopeInput;
        return false;
      }
    }
    return super.valid(command);
  }
}

/** Dialog that validates an optional secret label and instant. */
class GenerateSecretDialog extends Dialog {
  /** Creates a movable secret form. */
  constructor(
    width: number,
    height: number,
    private readonly label: Signal<string>,
    private readonly expiry: Signal<string>,
    private readonly labelInput: Input,
    private readonly expiryInput: Input,
  ) {
    super({ title: 'Generate client secret', width, height, centered: true });
  }

  /** Rejects controls, oversize labels, and malformed instants. */
  valid(command: string): boolean {
    if (command === Commands.cancel) return true;
    if (!validText(this.label.peek(), 0, 255, true)) {
      this.firstInvalid = this.labelInput;
      return false;
    }
    if (this.expiry.peek() && !validInstant(this.expiry.peek())) {
      this.firstInvalid = this.expiryInput;
      return false;
    }
    return super.valid(command);
  }
}

/** Returns true for bounded control-free text. */
function validText(value: string, minimum: number, maximum: number, optional = false): boolean {
  if (value.length === 0) return optional || minimum === 0;
  if (value.length < minimum || value.length > maximum) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Returns true for a safe absolute redirect URI without a fragment or wildcard. */
function isRedirectUri(value: string): boolean {
  if (!validText(value, 1, 2_048) || value.includes('*')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1 && parsed.hash === '';
  } catch {
    return false;
  }
}

/** Returns true for one exact HTTP(S) browser origin. */
function isOrigin(value: string): boolean {
  if (!validText(value, 1, 2_048) || value.includes('*')) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash &&
      parsed.origin === value
    );
  } catch {
    return false;
  }
}

/** Validates one bounded collection as a whole. */
function validCollection(
  values: readonly string[],
  minimum: number,
  maximum: number,
  validator: (value: string) => boolean,
): boolean {
  return values.length >= minimum && values.length <= maximum && values.every(validator);
}

/** Returns true for a canonical UTC instant accepted by the SDK boundary. */
function validInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

/** Returns a dialog size capped to the current terminal surface. */
function dialogSize(
  host: AdminClientDialogHost,
  preferredWidth: number,
  preferredHeight: number,
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, Math.min(preferredWidth, host.desktop.bounds.width)),
    height: Math.max(1, Math.min(preferredHeight, host.desktop.bounds.height)),
  };
}

/** Runs one abortable modal and always removes it from the desktop. */
async function runDialog(
  host: AdminClientDialogHost,
  dialog: Dialog,
  operationSignal: AbortSignal,
): Promise<string> {
  host.desktop.addWindow(dialog);
  try {
    return await runAbortableAdminDialog(
      host.loop,
      operationSignal,
      async () => (await host.loop.execView<string>(dialog)) ?? Commands.cancel,
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return Commands.cancel;
    throw error;
  } finally {
    host.desktop.removeWindow(dialog);
  }
}

/** Creates one fixed one-row labeled input. */
function inputRow(label: string, input: Input): ReturnType<typeof row> {
  return fixed(row({ gap: 1 }, fixed(new Label(label, input), 18), grow(input)), 1);
}

/** Creates rows from immutable collection strings. */
function collectionRows(values: readonly string[]): CollectionRow[] {
  return values.map((value, index) => ({ id: String(index), value }));
}

/** Creates one DataGrid-backed collection editor with explicit row actions. */
function collectionEditor(
  title: string,
  values: Signal<CollectionRow[]>,
): { readonly content: Group; readonly grid: CollectionGrid } {
  const selected = signal(0);
  const entry = signal('');
  const input = new Input({ value: entry, maxLength: 2_048, validator: textValidator(0, 2_048) });
  const grid = new CollectionGrid(values, selected);
  grid.focused.set(0);
  const add = new Button('~A~dd', {
    onClick: () => {
      const value = entry.peek();
      if (!validText(value, 1, 2_048) || values.peek().length >= 10) return;
      grid.setRows([...values.peek(), { id: String(Date.now()), value }]);
      entry.set('');
    },
  });
  const edit = new Button('~E~dit', {
    disabled: () => values().length === 0,
    onClick: () => {
      const index = Math.max(0, Math.min(selected.peek(), values.peek().length - 1));
      const value = entry.peek();
      if (!validText(value, 1, 2_048) || !values.peek()[index]) return;
      grid.setRows(values.peek().map((row, rowIndex) => rowIndex === index ? { ...row, value } : row));
    },
  });
  const remove = new Button('~R~emove', {
    disabled: () => values().length === 0,
    onClick: () => {
      const index = Math.max(0, Math.min(selected.peek(), values.peek().length - 1));
      grid.setRows(values.peek().filter((_row, rowIndex) => rowIndex !== index));
    },
  });
  const content = col(
    { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
    fixed(new Text(title), 1),
    fixed(grid, 6),
    inputRow('Value', input),
    fixed(row({ gap: 1 }, fixed(add, 9), fixed(edit, 9), fixed(remove, 11), spacer()), 2),
  );
  return { content, grid };
}

/** Keeps JSVision's owned vertical bar explicit during its initial Layout DSL pass. */
class ClientFormScroller extends Scroller {
  constructor(options: ConstructorParameters<typeof Scroller>[0]) {
    super(options);
    this.vbar?.setLayout({ size: { kind: 'fixed', cells: 1 } });
  }
}

/** Wraps one tab page in the required vertical Scroller. */
function scrollPage(content: Group, width: number, height: number): Scroller {
  return new ClientFormScroller({
    content,
    extent: { width: Math.max(1, width - 2), height },
    scrollbars: 'vertical',
  });
}

/** Creates form signals from either server defaults or one authoritative client. */
function createForm(options: ClientConfigurationDialogOptions): ClientForm {
  const current = options.mode === 'edit' ? options.client : undefined;
  const clientName = signal(current?.clientName ?? '');
  const redirects = signal(collectionRows(current?.redirectUris ?? []));
  const logoutRedirects = signal(collectionRows(current?.postLogoutRedirectUris ?? []));
  const origins = signal(collectionRows(current?.allowedOrigins ?? []));
  const scope = signal(current?.scope ?? '');
  const secretLabel = signal('');
  const application = signal<AdminApplication | null>(
    options.mode === 'create'
      ? options.applications.find((candidate) => candidate.status === 'active') ?? null
      : null,
  );
  const clientType = signal(current?.clientType === 'public' ? 0 : 1);
  const applicationType = signal(current ? ['web', 'native', 'spa'].indexOf(current.applicationType) : 0);
  const protocolMode = signal(current ? 1 : 0);
  const grants = signal([
    current?.grantTypes.includes('authorization_code') ?? true,
    current?.grantTypes.includes('client_credentials') ?? false,
    current?.grantTypes.includes('refresh_token') ?? true,
  ]);
  const authenticationMethod = signal(
    current ? ['client_secret_basic', 'client_secret_post', 'none'].indexOf(current.tokenEndpointAuthMethod) : 0,
  );
  const requirePkce = signal(current?.requirePkce ?? true);
  const loginMode = signal(
    !current || current.loginMethods === null
      ? 0
      : current?.loginMethods.length === 2
        ? 3
        : current?.loginMethods[0] === 'password'
          ? 1
          : 2,
  );
  return {
    clientName,
    redirects,
    logoutRedirects,
    origins,
    scope,
    secretLabel,
    application,
    clientType,
    applicationType,
    protocolMode,
    grants,
    authenticationMethod,
    requirePkce,
    loginMode,
    nameInput: new Input({ value: clientName, maxLength: 255, validator: textValidator(1, 255, false) }),
    scopeInput: new Input({ value: scope, maxLength: 2_048, validator: textValidator(0, 2_048) }),
    secretLabelInput: new Input({ value: secretLabel, maxLength: 255, validator: textValidator(0, 255) }),
  };
}

/** Creates the four familiar configuration tab pages. */
function configurationTabs(
  options: ClientConfigurationDialogOptions,
  form: ClientForm,
  width: number,
): Tab[] {
  const applicationPicker = options.mode === 'create'
    ? new ComboBox<AdminApplication>({
        items: signal(options.applications.filter((application) => application.status === 'active')),
        getText: (application) => application.name,
        value: form.application,
        editable: false,
      })
    : undefined;
  const basic = col(
    { gap: 0, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
    fixed(new Text(`Organization: ${options.organization.name} (read only)`), 1),
    options.mode === 'edit' && fixed(new Text(`Client ID: ${options.client.clientId} (read only)`), 1),
    inputRow('Client name', form.nameInput),
    applicationPicker && fixed(row({ gap: 1 }, fixed(new Text('Application'), 18), grow(applicationPicker)), 1),
    options.mode === 'edit' && fixed(new Text(`Application: ${options.client.applicationId} (read only)`), 1),
    fixed(new Text(`Application type${options.mode === 'edit' ? `: ${options.client.applicationType} (read only)` : ''}`), 1),
    options.mode === 'create' && fixed(new RadioGroup({ labels: ['~W~eb', '~N~ative', '~S~PA'], value: form.applicationType }), 3),
    fixed(new Text(`Client type${options.mode === 'edit' ? `: ${options.client.clientType} (read only)` : ''}`), 1),
    options.mode === 'create' && fixed(new RadioGroup({ labels: ['~P~ublic', '~C~onfidential'], value: form.clientType }), 2),
    options.mode === 'create' && inputRow('Initial secret', form.secretLabelInput),
    spacer(),
  );
  const redirectEditor = collectionEditor('Redirect URIs', form.redirects);
  const logoutEditor = collectionEditor('Post-logout redirect URIs', form.logoutRedirects);
  const redirects = col({ gap: 1 }, grow(redirectEditor.content), grow(logoutEditor.content));

  const originEditor = collectionEditor('Allowed origins', form.origins);
  const protocol = col(
    { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
    fixed(new Text('Protocol values: Server default or Custom'), 1),
    fixed(new RadioGroup({ labels: ['Server ~d~efault', '~C~ustom'], value: form.protocolMode }), 2),
    fixed(new Text('Grant types'), 1),
    fixed(new CheckGroup({ labels: ['Authorization code', 'Client credentials', 'Refresh token'], value: form.grants }), 3),
    fixed(new Text('Response types: code'), 1),
    inputRow('Scope', form.scopeInput),
    fixed(new Text('Token authentication'), 1),
    fixed(new RadioGroup({ labels: ['Client secret basic', 'Client secret post', 'None'], value: form.authenticationMethod }), 3),
    fixed(new Switch({ value: form.requirePkce, label: '~P~KCE required' }), 1),
    grow(originEditor.content),
  );
  const login = col(
    { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
    fixed(new Text('Login methods'), 1),
    fixed(new RadioGroup({ labels: ['~I~nherit', '~P~assword', '~M~agic link', '~B~oth'], value: form.loginMode }), 4),
    spacer(),
  );
  return [
    { title: '~B~asic', content: scrollPage(basic, width, 18) },
    { title: '~R~edirects', content: scrollPage(redirects, width, 28) },
    { title: '~P~rotocol', content: scrollPage(protocol, width, 32) },
    { title: '~L~ogin', content: scrollPage(login, width, 12) },
  ];
}

/** Converts the complete form into an SDK create payload with untouched defaults omitted. */
function createPayload(form: ClientForm): Omit<CreateClientInput, 'organizationId'> {
  const application = form.application.peek();
  if (!application) throw new Error('A validated application is required.');
  const input: Omit<CreateClientInput, 'organizationId'> = {
    applicationId: application.id,
    clientName: form.clientName.peek(),
    clientType: form.clientType.peek() === 0 ? 'public' : 'confidential',
    applicationType: ['web', 'native', 'spa'][form.applicationType.peek()] as 'web' | 'native' | 'spa',
    redirectUris: form.redirects.peek().map((entry) => entry.value),
  };
  const logout = form.logoutRedirects.peek().map((entry) => entry.value);
  if (logout.length) input.postLogoutRedirectUris = logout;
  if (form.secretLabel.peek() && input.clientType === 'confidential') input.secretLabel = form.secretLabel.peek();
  if (form.protocolMode.peek() === 1) Object.assign(input, protocolPayload(form));
  input.loginMethods = loginPayload(form.loginMode.peek());
  if (input.loginMethods === null) delete input.loginMethods;
  return input;
}

/** Converts the protocol controls to closed SDK values. */
function protocolPayload(form: ClientForm): UpdateClientInput {
  const grantNames = ['authorization_code', 'client_credentials', 'refresh_token'] as const;
  const authenticationNames = ['client_secret_basic', 'client_secret_post', 'none'] as const;
  return {
    grantTypes: form.grants.peek().flatMap((selected, index) => selected ? [grantNames[index]!] : []),
    responseTypes: ['code'],
    scope: form.scope.peek(),
    tokenEndpointAuthMethod: authenticationNames[form.authenticationMethod.peek()]!,
    allowedOrigins: form.origins.peek().map((entry) => entry.value),
    requirePkce: form.requirePkce.peek(),
  };
}

/** Converts the login selection to the SDK's nullable override. */
function loginPayload(index: number): UpdateClientInput['loginMethods'] {
  if (index === 1) return ['password'];
  if (index === 2) return ['magic_link'];
  if (index === 3) return ['password', 'magic_link'];
  return null;
}

/** Converts a form into a complete bounded update payload. */
function updatePayload(form: ClientForm): UpdateClientInput {
  return {
    clientName: form.clientName.peek(),
    redirectUris: form.redirects.peek().map((entry) => entry.value),
    postLogoutRedirectUris: form.logoutRedirects.peek().map((entry) => entry.value),
    ...protocolPayload(form),
    loginMethods: loginPayload(form.loginMode.peek()),
  };
}

/** Shows the shared client create/edit dialog on the requested entry tab. */
export async function showClientConfigurationDialog(
  host: AdminClientDialogHost,
  operationSignal: AbortSignal,
  options: ClientConfigurationDialogOptions,
): Promise<ClientConfigurationDialogResult> {
  const { width, height } = dialogSize(host, 78, 23);
  const form = createForm(options);
  const dialog = new ClientConfigurationDialog(
    options.mode === 'create' ? 'Create OIDC client' : 'Configure OIDC client',
    width,
    height,
    form,
    options.mode === 'create',
  );
  const tabNames: AdminClientConfigurationTab[] = ['Basic', 'Redirects', 'Protocol', 'Login'];
  const active = signal(Math.max(0, tabNames.indexOf(options.initialTab)));
  const tabs = signal(configurationTabs(options, form, width));
  const tabView = new TabView({ tabs, active });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
        grow(tabView),
        fixed(new Text('Optional protocol fields: Server default'), 1),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            fixed(new Button(options.mode === 'create' ? '~C~reate' : '~S~ave', { command: Commands.ok, default: true }), 12),
            fixed(new Button('Cancel', { command: Commands.cancel }), 10),
          ),
          2,
        ),
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  return options.mode === 'create'
    ? { kind: 'create', input: createPayload(form) }
    : { kind: 'update', clientId: options.client.id, input: updatePayload(form) };
}

/** Shows a named client lifecycle confirmation with the selected organization. */
export async function showClientLifecycleDialog(
  host: AdminClientDialogHost,
  operationSignal: AbortSignal,
  action: 'deactivate' | 'revoke',
  organization: AdminOrganizationContext,
  client: AdminClient,
): Promise<ClientLifecycleDialogResult> {
  const { width, height } = dialogSize(host, 60, 12);
  const dialog = new Dialog({ title: `${action === 'revoke' ? 'Revoke' : 'Deactivate'} OIDC client`, width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        grow(new Text(`Organization: ${organization.name}\nClient: ${client.clientName}\n${action === 'revoke' ? 'Revocation is permanent and has no restore action.' : 'The client can be activated again later.'}`)),
        fixed(row({ gap: 1 }, spacer(), fixed(new Button(action === 'revoke' ? 'Revoke permanently' : 'Deactivate', { command: Commands.ok, default: true }), 20), fixed(new Button('Cancel', { command: Commands.cancel }), 10)), 2),
      ),
    ),
  );
  return (await runDialog(host, dialog, operationSignal)) === Commands.ok
    ? { kind: action, clientId: client.id }
    : { kind: 'cancel' };
}

/** Shows the bounded label and expiry form for modern secret generation. */
export async function showGenerateClientSecretDialog(
  host: AdminClientDialogHost,
  operationSignal: AbortSignal,
  client: AdminClient,
): Promise<GenerateClientSecretDialogResult> {
  const { width, height } = dialogSize(host, 60, 12);
  const label = signal('');
  const expiry = signal('');
  const labelInput = new Input({ value: label, maxLength: 255, validator: textValidator(0, 255) });
  const expiryInput = new Input({ value: expiry, maxLength: 40 });
  const dialog = new GenerateSecretDialog(width, height, label, expiry, labelInput, expiryInput);
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text(`Client: ${client.clientName}`), 1),
        inputRow('Label', labelInput),
        inputRow('Expires at', expiryInput),
        grow(new Text('The secret value is shown once after generation.')),
        fixed(row({ gap: 1 }, spacer(), fixed(new Button('~G~enerate', { command: Commands.ok, default: true }), 12), fixed(new Button('Cancel', { command: Commands.cancel }), 10)), 2),
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: GenerateSecretInput = {};
  if (label.peek()) input.label = label.peek();
  if (expiry.peek()) input.expiresAt = expiry.peek();
  return { kind: 'generate', clientId: client.id, ...(Object.keys(input).length ? { input } : {}) };
}

/** Shows the permanent nested-secret revocation target. */
export async function showRevokeClientSecretDialog(
  host: AdminClientDialogHost,
  operationSignal: AbortSignal,
  organization: AdminOrganizationContext,
  client: AdminClient,
  secret: AdminClientSecret,
): Promise<RevokeClientSecretDialogResult> {
  if (secret.clientId !== client.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 60, 12);
  const dialog = new Dialog({ title: 'Revoke client secret', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        grow(new Text(`Organization: ${organization.name}\nClient: ${client.clientName}\nSecret: ${secret.label ?? secret.id}\nRevocation is permanent.`)),
        fixed(row({ gap: 1 }, spacer(), fixed(new Button('Revoke permanently', { command: Commands.ok, default: true }), 20), fixed(new Button('Cancel', { command: Commands.cancel }), 10)), 2),
      ),
    ),
  );
  return (await runDialog(host, dialog, operationSignal)) === Commands.ok
    ? { kind: 'revoke-secret', clientId: client.id, secretId: secret.id }
    : { kind: 'cancel' };
}

/** Shows one transient plaintext secret in a bounded non-editable view. */
export async function showOneTimeClientSecretDialog(
  host: AdminClientDialogHost,
  operationSignal: AbortSignal,
  value: {
    readonly clientName: string;
    readonly clientId: string;
    readonly label: string | null;
    readonly plaintext: string;
  },
): Promise<void> {
  const { width, height } = dialogSize(host, 76, 14);
  const dialog = new Dialog({ title: 'One-time client secret', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text(`Client: ${value.clientName}`), 1),
        fixed(new Text(`Client ID: ${value.clientId}`), 1),
        fixed(new Text(`Label: ${value.label ?? 'Not provided'}`), 1),
        fixed(new Text(value.plaintext), 2),
        fixed(new Text('Store this value now. It cannot be shown again.'), 1),
        fixed(row({ gap: 1 }, spacer(), fixed(new Button('Close', { command: Commands.ok, default: true }), 10)), 2),
      ),
    ),
  );
  await runDialog(host, dialog, operationSignal);
}
