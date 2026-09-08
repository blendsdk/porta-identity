/** Focused OIDC protocol and login-experience editors. */

import type { UpdateClientInput } from '@portaidentity/sdk';
import {
  Button,
  CheckGroup,
  col,
  Commands,
  cover,
  Dialog,
  fixed,
  grow,
  GroupBox,
  Input,
  Label,
  RadioGroup,
  row,
  signal,
  spacer,
  Switch,
  Text,
} from '@jsvision/ui';
import type { EventLoop, ModalDialogHost, Signal } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminClient } from './client-state.js';
import { ClientFormScroller } from './client-form-scroller.js';
import type { AdminOrganizationContext } from './state.js';
import { textValidator } from './user-dialog-fields.js';

/** Modal host needed for abort-driven focused editor closure. */
export interface ClientProtocolLoginDialogHost extends ModalDialogHost {
  /** Event loop that can synchronously close an owned modal. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal'>;
}

/** Result returned by either focused configuration editor. */
export type ClientFocusedEditorResult =
  | { readonly kind: 'update'; readonly clientId: string; readonly input: UpdateClientInput }
  | { readonly kind: 'cancel' };

/** Fixed full-page surface with caller-supplied submit validation. */
class FocusedClientDialog extends Dialog {
  /** Creates a fixed editor that will be maximized after mounting. */
  constructor(
    title: string,
    width: number,
    height: number,
    private readonly canSubmit: () => boolean,
    private readonly invalidControl: Input | CheckGroup,
  ) {
    super({ title, width, height, centered: true });
    this.closable = false;
    this.movable = false;
    this.resizable = false;
    this.zoomable = false;
  }

  /** Applies the same validity rule to buttons, Enter, and programmatic submission. */
  valid(command: string): boolean {
    if (command === Commands.cancel) return true;
    if (!this.canSubmit()) {
      this.firstInvalid = this.invalidControl;
      return false;
    }
    return super.valid(command);
  }
}

/** Returns true for bounded scope text that cannot alter terminal rendering. */
function validScope(value: string): boolean {
  if (value.length > 2_048) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Maximizes a fixed editor while keeping restore and resize unavailable. */
function maximizeDialog(dialog: Dialog): void {
  if (dialog.isZoomed()) return;
  dialog.zoomable = true;
  dialog.zoom();
  dialog.zoomable = false;
}

/** Runs one abortable focused modal and always removes it from the desktop. */
async function runDialog(
  host: ClientProtocolLoginDialogHost,
  dialog: Dialog,
  operationSignal: AbortSignal,
): Promise<string> {
  host.desktop.addWindow(dialog);
  maximizeDialog(dialog);
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

/** Creates the read-only organization and client identity region shared by focused editors. */
function clientContext(organization: AdminOrganizationContext, client: AdminClient): GroupBox {
  const context = new GroupBox({ title: 'Client', padding: 1 });
  context.add(
    cover(
      col(
        {},
        fixed(new Text(`Organization: ${organization.name}`), 1),
        fixed(new Text(`Client: ${client.clientName}`), 1),
      ),
    ),
  );
  return context;
}

/** Adds a spacious editor body and naturally sized Save/Cancel actions. */
function addEditorLayout(
  dialog: Dialog,
  context: GroupBox,
  compactContext: string,
  editor: GroupBox,
  editorHeight: number,
  compact: boolean,
  canSave: () => boolean,
) {
  const compactContextBox = new GroupBox({ title: 'Client', padding: 0 });
  compactContextBox.add(cover(new Text(compactContext)));
  const editorContent = col(fixed(editor, editorHeight));
  const editorScroller = new ClientFormScroller(editorContent, () => ({
    width: Math.max(1, (dialog.bounds.width || 78) - (compact ? 4 : 6)),
    height: editorHeight,
  }));
  dialog.add(
    cover(
      col(
        {
          gap: compact ? 0 : 1,
          padding: compact
            ? { top: 0, right: 1, bottom: 0, left: 1 }
            : { top: 1, right: 2, bottom: 1, left: 2 },
        },
        fixed(compact ? compactContextBox : context, compact ? 3 : 4),
        grow(editorScroller),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            new Button('~S~ave', {
              command: Commands.ok,
              default: true,
              disabled: () => !canSave(),
            }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );
}

/** Returns whether the selected protocol combination matches server compatibility rules. */
function protocolIsValid(
  client: AdminClient,
  grants: Signal<boolean[]>,
  authenticationMethod: Signal<number>,
  requirePkce: Signal<boolean>,
  scope: Signal<string>,
): boolean {
  const selectedGrants = grants();
  if (!selectedGrants.some(Boolean) || !validScope(scope())) return false;
  if (client.clientType === 'public') {
    return authenticationMethod() === 2 && requirePkce() && !selectedGrants[1];
  }
  return authenticationMethod() !== 2;
}

/** Opens the focused protocol editor for one organization-owned client. */
export async function showClientProtocolDialog(
  host: ClientProtocolLoginDialogHost,
  operationSignal: AbortSignal,
  organization: AdminOrganizationContext,
  client: AdminClient,
): Promise<ClientFocusedEditorResult> {
  if (client.organizationId !== organization.id) return { kind: 'cancel' };
  const grantNames = ['authorization_code', 'client_credentials', 'refresh_token'] as const;
  const authenticationNames = ['client_secret_basic', 'client_secret_post', 'none'] as const;
  const grants = signal([
    client.grantTypes.includes('authorization_code'),
    client.grantTypes.includes('client_credentials'),
    client.grantTypes.includes('refresh_token'),
  ]);
  const authenticationMethod = signal(authenticationNames.indexOf(client.tokenEndpointAuthMethod));
  const requirePkce = signal(client.requirePkce);
  const scope = signal(client.scope);
  const grantChoices = new CheckGroup({
    labels: ['Authorization code', 'Client credentials', 'Refresh token'],
    value: grants,
  });
  const scopeInput = new Input({
    value: scope,
    maxLength: 2_048,
    validator: textValidator(0, 2_048),
  });
  const canSave = () => protocolIsValid(client, grants, authenticationMethod, requirePkce, scope);
  const dialog = new FocusedClientDialog(
    'OIDC client protocol',
    Math.max(1, Math.min(78, host.desktop.bounds.width)),
    Math.max(1, Math.min(23, host.desktop.bounds.height)),
    canSave,
    grantChoices,
  );
  const editor = new GroupBox({ title: 'Protocol configuration', padding: 1 });
  editor.add(
    cover(
      col(
        { gap: 1 },
        fixed(new Text(`Client type: ${client.clientType} (read only)`), 1),
        fixed(new Text('Grant types'), 1),
        fixed(grantChoices, 3),
        fixed(new Text('Response type: code (read only)'), 1),
        fixed(row({ gap: 1 }, fixed(new Label('Scope', scopeInput), 18), grow(scopeInput)), 1),
        fixed(new Text('Token endpoint authentication'), 1),
        fixed(
          new RadioGroup({
            labels: ['Client secret basic', 'Client secret post', 'None'],
            value: authenticationMethod,
          }),
          3,
        ),
        fixed(new Switch({ value: requirePkce, label: '~P~KCE required' }), 1),
        fixed(
          new Text(() =>
            canSave() ? '' : 'Choose a protocol combination supported by this client type.',
          ),
          2,
        ),
      ),
    ),
  );
  addEditorLayout(
    dialog,
    clientContext(organization, client),
    `Organization: ${organization.name} · Client: ${client.clientName}`,
    editor,
    21,
    host.desktop.bounds.height <= 12,
    canSave,
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  return {
    kind: 'update',
    clientId: client.id,
    input: {
      grantTypes: grants
        .peek()
        .flatMap((selected, index) => (selected ? [grantNames[index]!] : [])),
      responseTypes: ['code'],
      scope: scope.peek(),
      tokenEndpointAuthMethod: authenticationNames[authenticationMethod.peek()]!,
      requirePkce: requirePkce.peek(),
    },
  };
}

/** Opens the focused inherited-or-explicit login-method editor. */
export async function showClientLoginDialog(
  host: ClientProtocolLoginDialogHost,
  operationSignal: AbortSignal,
  organization: AdminOrganizationContext,
  client: AdminClient,
): Promise<ClientFocusedEditorResult> {
  if (client.organizationId !== organization.id) return { kind: 'cancel' };
  const inherited = signal(client.loginMethods === null);
  const initialMethods = client.loginMethods ?? client.effectiveLoginMethods;
  const methods = signal([
    initialMethods.includes('password'),
    initialMethods.includes('magic_link'),
  ]);
  const methodChoices = new CheckGroup({
    labels: ['~P~assword', '~M~agic link'],
    value: methods,
  });
  const canSave = () => inherited() || methods().some(Boolean);
  const dialog = new FocusedClientDialog(
    'OIDC client login experience',
    Math.max(1, Math.min(78, host.desktop.bounds.width)),
    Math.max(1, Math.min(23, host.desktop.bounds.height)),
    canSave,
    methodChoices,
  );
  let wasInherited = inherited.peek();
  dialog.onMount(() => {
    dialog.bind(
      () => inherited(),
      (usesDefaults) => {
        methodChoices.focusable = !usesDefaults;
        if (wasInherited && !usesDefaults) methods.set([false, false]);
        if (usesDefaults) {
          methods.set([
            client.effectiveLoginMethods.includes('password'),
            client.effectiveLoginMethods.includes('magic_link'),
          ]);
        }
        wasInherited = usesDefaults;
      },
      { relayout: true },
    );
  });
  methodChoices.focusable = !inherited.peek();
  const editor = new GroupBox({ title: 'Login methods', padding: 1 });
  editor.add(
    cover(
      col(
        { gap: 1 },
        fixed(new Text(`Organization defaults: ${organization.name}`), 1),
        fixed(
          new Text(
            `Effective methods: ${client.effectiveLoginMethods
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
      ),
    ),
  );
  addEditorLayout(
    dialog,
    clientContext(organization, client),
    `Organization: ${organization.name} · Client: ${client.clientName}`,
    editor,
    13,
    host.desktop.bounds.height <= 12,
    canSave,
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const selected = methods.peek();
  return {
    kind: 'update',
    clientId: client.id,
    input: {
      loginMethods: inherited.peek()
        ? null
        : [selected[0] ? 'password' : null, selected[1] ? 'magic_link' : null].filter(
            (method): method is 'password' | 'magic_link' => method !== null,
          ),
    },
  };
}
