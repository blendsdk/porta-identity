/** Movable Layout DSL dialogs for selected-organization OIDC client administration. */

import {
  Button,
  col,
  Commands,
  cover,
  Dialog,
  fixed,
  grow,
  Input,
  Label,
  row,
  Scroller,
  signal,
  spacer,
  Text,
} from '@jsvision/ui';

import { deleteActionLabel, deleteConfirmationLayout } from './delete-confirmation-layout.js';
import type { EventLoop, ModalDialogHost } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminClient, AdminClientSecret } from './client-state.js';
import type { AdminOrganizationContext } from './state.js';
import { textValidator } from './user-dialog-fields.js';

export { showClientRegistrationDialog } from './client-registration-dialog.js';
export type {
  AdminClientRegistrationDialogHost,
  AdminClientRegistrationDialogOptions,
  AdminClientRegistrationDialogResult,
} from './client-registration-dialog.js';
export { showClientAuthenticationDialog } from './client-authentication-dialog.js';
export type {
  ClientAuthenticationDialogHost,
  ClientAuthenticationDialogResult,
} from './client-authentication-dialog.js';
export {
  showClientLoginDialog,
  showClientProtocolDialog,
} from './client-protocol-login-dialogs.js';
export type {
  ClientFocusedEditorResult,
  ClientProtocolLoginDialogHost,
} from './client-protocol-login-dialogs.js';
export { showGenerateClientSecretDialog } from './client-credential-dialogs.js';
export type {
  ClientCredentialDialogHost,
  GenerateClientSecretDialogResult,
} from './client-credential-dialogs.js';

/** Modal host needed for abort-driven client dialog closure. */
export interface AdminClientDialogHost extends ModalDialogHost {
  /** Event loop that can synchronously close and focus the owned modal. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Result of an explicit client lifecycle confirmation. */
export type ClientLifecycleDialogResult =
  { readonly kind: 'deactivate'; readonly clientId: string } | { readonly kind: 'cancel' };

/** Result of the focused client-name editor. */
export type EditClientNameDialogResult =
  | {
      readonly kind: 'update';
      readonly clientId: string;
      readonly input: { readonly clientName: string };
    }
  | { readonly kind: 'cancel' };

/** Result of an irreversible client-deletion dialog. */
export type DeleteClientDialogResult =
  { readonly kind: 'delete'; readonly clientId: string } | { readonly kind: 'cancel' };

/** Result of a permanent nested-secret revocation confirmation. */
export type RevokeClientSecretDialogResult =
  | { readonly kind: 'revoke-secret'; readonly clientId: string; readonly secretId: string }
  | { readonly kind: 'cancel' };

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

/** Keeps JSVision's owned vertical bar explicit during its initial Layout DSL pass. */
class ClientFormScroller extends Scroller {
  constructor(options: ConstructorParameters<typeof Scroller>[0]) {
    super(options);
    this.vbar?.setLayout({ size: { kind: 'fixed', cells: 1 } });
  }
}

/** Shows one small editor for the only mutable field in the Overview section. */
export async function showEditClientNameDialog(
  host: AdminClientDialogHost,
  operationSignal: AbortSignal,
  organization: AdminOrganizationContext,
  client: AdminClient,
): Promise<EditClientNameDialogResult> {
  if (client.organizationId !== organization.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 62, 13);
  const clientName = signal(client.clientName);
  const nameInput = new Input({
    value: clientName,
    maxLength: 255,
    validator: textValidator(1, 255, false),
  });
  const dialog = new Dialog({ title: 'Edit OIDC client name', width, height, centered: true });
  const fields = col(
    { gap: 1 },
    fixed(new Text(`Client ID: ${client.clientId}`), 1),
    fixed(new Text(`Client type: ${client.clientType}`), 1),
    fixed(new Text(`Application type: ${client.applicationType}`), 1),
    inputRow('Client name', nameInput),
  );
  const form = new ClientFormScroller({
    content: grow(fields),
    extent: { width: Math.max(1, width - 6), height: 8 },
    scrollbars: 'vertical',
  });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 0, right: 2, bottom: 0, left: 2 } },
        grow(form),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            new Button('~S~ave', { command: Commands.ok, default: true }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  return { kind: 'update', clientId: client.id, input: { clientName: clientName.peek() } };
}

/** Shows a named client lifecycle confirmation with the selected organization. */
export async function showClientLifecycleDialog(
  host: AdminClientDialogHost,
  operationSignal: AbortSignal,
  action: 'deactivate',
  organization: AdminOrganizationContext,
  client: AdminClient,
): Promise<ClientLifecycleDialogResult> {
  const { width, height } = dialogSize(host, 60, 12);
  const dialog = new Dialog({ title: 'Deactivate OIDC client', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        grow(
          new Text(
            `Organization: ${organization.name}\nClient: ${client.clientName}\nThe client can be activated again later.`,
          ),
        ),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            new Button('Deactivate', { command: Commands.ok, default: true }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );
  return (await runDialog(host, dialog, operationSignal)) === Commands.ok
    ? { kind: action, clientId: client.id }
    : { kind: 'cancel' };
}

/** Shows the protocol-authority cascade before permanently deleting a client. */
export async function showDeleteClientDialog(
  host: AdminClientDialogHost,
  operationSignal: AbortSignal,
  organization: AdminOrganizationContext,
  client: AdminClient,
): Promise<DeleteClientDialogResult> {
  if (client.organizationId !== organization.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 72, 14);
  const keep = new Button('Keep', { command: Commands.cancel, default: true });
  const remove = new Button(deleteActionLabel(client.clientName, width), {
    command: Commands.yes,
  });
  const dialog = new Dialog({ title: 'Delete OIDC client', width, height, centered: true });
  const confirmation = deleteConfirmationLayout({
    dialogWidth: width,
    details: `Organization: ${organization.name}\nClient: ${client.clientName}`,
    warning: 'Deleting this client removes its secrets and client, grant, and protocol authority.',
    keep,
    remove,
  });
  dialog.add(cover(confirmation.content));
  const outcome = runDialog(host, dialog, operationSignal);
  host.loop.focusView(keep);
  return (await outcome) === Commands.yes
    ? { kind: 'delete', clientId: client.id }
    : { kind: 'cancel' };
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
        grow(
          new Text(
            `Organization: ${organization.name}\nClient: ${client.clientName}\nSecret: ${secret.label ?? secret.id}\nRevocation is permanent.`,
          ),
        ),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            new Button('Revoke permanently', { command: Commands.ok, default: true }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
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
    readonly expiresAt: string | null;
  },
): Promise<void> {
  const { width, height } = dialogSize(host, 76, 15);
  const dialog = new Dialog({ title: 'One-time client secret', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text(`Client: ${value.clientName}`), 1),
        fixed(new Text(`Client ID: ${value.clientId}`), 1),
        fixed(new Text(`Label: ${value.label ?? 'Not provided'}`), 1),
        fixed(new Text(`Expires: ${value.expiresAt ?? 'Never'}`), 1),
        fixed(new Text(value.plaintext), 2),
        fixed(new Text('Store this value now. It cannot be shown again.'), 1),
        fixed(
          row({ gap: 1 }, spacer(), new Button('Close', { command: Commands.ok, default: true })),
          2,
        ),
      ),
    ),
  );
  await runDialog(host, dialog, operationSignal);
}
