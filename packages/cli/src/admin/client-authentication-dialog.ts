/** Compact CRUD dialogs and collection projection for OIDC authentication URLs. */

import type { UpdateClientInput } from '@portaidentity/sdk';
import {
  Button, col, ComboBox, Commands, cover, Dialog, fixed, grow, Input, Label, row, signal, spacer,
  Text,
} from '@jsvision/ui';
import type { EventLoop, ModalDialogHost } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminClient } from './client-state.js';
import { deleteConfirmationLayout } from './delete-confirmation-layout.js';
import { textValidator } from './user-dialog-fields.js';

/** Stable discriminator for one server-owned authentication URL collection. */
export type AuthenticationUrlKind = 'redirect' | 'post-logout' | 'origin';

/** Display choice used by the Add and Edit dialog type selector. */
export interface AuthenticationUrlChoice {
  /** Stable collection discriminator submitted by the dialog. */
  readonly kind: AuthenticationUrlKind;
  /** Human-readable collection name. */
  readonly label: string;
}

/** One row in the unified Authentication tab grid. */
export interface AdminAuthenticationUrlRow {
  /** Projection-local identity made from the collection and its index. */
  readonly id: string;
  /** Server collection that owns this value. */
  readonly kind: AuthenticationUrlKind;
  /** Human-readable collection name shown in the grid. */
  readonly type: string;
  /** Exact URI or origin stored by the server. */
  readonly value: string;
}

/** One typed value returned by the focused Add or Edit dialog. */
export interface AuthenticationUrlDraft {
  /** Destination server collection. */
  readonly kind: AuthenticationUrlKind;
  /** Exact URI or origin entered by the administrator. */
  readonly value: string;
}

/** Supported local mutation converted into one complete server update. */
export type AuthenticationUrlMutation =
  | { readonly kind: 'add'; readonly next: AuthenticationUrlDraft }
  | { readonly kind: 'edit'; readonly previous: AdminAuthenticationUrlRow; readonly next: AuthenticationUrlDraft }
  | { readonly kind: 'delete'; readonly previous: AdminAuthenticationUrlRow };

/** Result returned by the focused Add or Edit dialog. */
export type AuthenticationUrlDialogResult =
  | { readonly kind: 'save'; readonly row: AuthenticationUrlDraft }
  | { readonly kind: 'cancel' };

/** Result returned by the permanent authentication URL confirmation. */
export type DeleteAuthenticationUrlDialogResult =
  | { readonly kind: 'delete' }
  | { readonly kind: 'cancel' };

/** Modal host needed for abort-driven authentication URL dialogs. */
export interface ClientAuthenticationDialogHost extends ModalDialogHost {
  /** Event loop that can synchronously close and focus an owned modal. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Closed selector choices shared by the grid projection and focused dialog. */
export const AUTHENTICATION_URL_CHOICES: readonly AuthenticationUrlChoice[] = [
  { kind: 'redirect', label: 'Redirect URI' },
  { kind: 'post-logout', label: 'Post-logout redirect URI' },
  { kind: 'origin', label: 'Allowed origin' },
];

/** Returns the display label for one collection discriminator. */
function kindLabel(kind: AuthenticationUrlKind): string {
  return AUTHENTICATION_URL_CHOICES.find((choice) => choice.kind === kind)?.label ?? kind;
}

/** Flattens the three authoritative ordered arrays without losing collection identity. */
export function authenticationUrlRows(client: AdminClient): AdminAuthenticationUrlRow[] {
  const rows = (kind: AuthenticationUrlKind, values: readonly string[]): AdminAuthenticationUrlRow[] =>
    values.map((value, index) => ({ id: `${kind}:${index}`, kind, type: kindLabel(kind), value }));
  return [
    ...rows('redirect', client.redirectUris),
    ...rows('post-logout', client.postLogoutRedirectUris),
    ...rows('origin', client.allowedOrigins),
  ];
}

/** Returns true for bounded, trimmed text that cannot alter terminal rendering. */
function validText(value: string): boolean {
  if (value.length < 1 || value.length > 2_048 || value.trim() !== value) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Returns true for one absolute redirect URI without wildcard or fragment syntax. */
function validRedirectUri(value: string): boolean {
  if (!validText(value) || value.includes('*') || value.includes('#')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1 && parsed.hash === '';
  } catch {
    return false;
  }
}

/** Returns true for one exact HTTP(S) origin without credentials or trailing content. */
function validOrigin(value: string): boolean {
  if (!validText(value) || value.includes('*')) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.username === '' &&
      parsed.password === '' && parsed.pathname === '/' && parsed.search === '' &&
      parsed.hash === '' && parsed.origin === value
    );
  } catch {
    return false;
  }
}

/** Returns whether one value is valid for its selected destination collection. */
function valueIsValid(kind: AuthenticationUrlKind, value: string): boolean {
  return kind === 'origin' ? validOrigin(value) : validRedirectUri(value);
}

/** Converts a client into mutable copies of its three URL collections. */
function clientCollections(client: AdminClient): Record<AuthenticationUrlKind, string[]> {
  return {
    redirect: [...client.redirectUris],
    'post-logout': [...client.postLogoutRedirectUris],
    origin: [...client.allowedOrigins],
  };
}

/** Finds an exact projected row and rejects stale row identities or values. */
function rowIndex(client: AdminClient, target: AdminAuthenticationUrlRow): number {
  const current = authenticationUrlRows(client).find(
    (row) => row.id === target.id && row.kind === target.kind && row.value === target.value,
  );
  return current ? Number(current.id.slice(current.id.lastIndexOf(':') + 1)) : -1;
}

/** Validates complete server collections after a local mutation. */
function collectionsAreValid(collections: Record<AuthenticationUrlKind, string[]>): boolean {
  return AUTHENTICATION_URL_CHOICES.every(({ kind }) => {
    const values = collections[kind];
    return values.length <= 10 && (kind !== 'redirect' || values.length >= 1) &&
      new Set(values).size === values.length && values.every((value) => valueIsValid(kind, value));
  });
}

/**
 * Rebuilds all three arrays for one confirmed row mutation.
 *
 * `undefined` means the row became stale or the mutation violates syntax, count, uniqueness, or
 * the required final Redirect URI invariant.
 */
export function buildAuthenticationUrlUpdate(
  client: AdminClient,
  mutation: AuthenticationUrlMutation,
): UpdateClientInput | undefined {
  const collections = clientCollections(client);
  if (mutation.kind !== 'add') {
    const index = rowIndex(client, mutation.previous);
    if (index < 0) return undefined;
    if (mutation.kind === 'edit' && mutation.previous.kind === mutation.next.kind)
      collections[mutation.previous.kind][index] = mutation.next.value;
    else collections[mutation.previous.kind].splice(index, 1);
  }
  if (
    mutation.kind === 'add' ||
    (mutation.kind === 'edit' && mutation.previous.kind !== mutation.next.kind)
  )
    collections[mutation.next.kind].push(mutation.next.value);
  if (!collectionsAreValid(collections)) return undefined;
  return {
    redirectUris: collections.redirect,
    postLogoutRedirectUris: collections['post-logout'],
    allowedOrigins: collections.origin,
  };
}

/** Explains the first validation failure for the current dialog values. */
function valueGuidance(
  client: AdminClient,
  existing: AdminAuthenticationUrlRow | null,
  next: AuthenticationUrlDraft,
): string {
  if (next.value.length === 0) return 'A value is required.';
  if (!valueIsValid(next.kind, next.value))
    return next.kind === 'origin'
      ? 'Enter an exact HTTP(S) origin without a path.'
      : 'Enter an absolute URL without a wildcard or fragment.';
  const mutation: AuthenticationUrlMutation = existing
    ? { kind: 'edit', previous: existing, next }
    : { kind: 'add', next };
  if (buildAuthenticationUrlUpdate(client, mutation)) return '';
  if (existing?.kind === 'redirect' && client.redirectUris.length === 1 && next.kind !== 'redirect')
    return 'At least one Redirect URI is required.';
  const values = clientCollections(client)[next.kind];
  const existingIndex = existing?.kind === next.kind ? rowIndex(client, existing) : -1;
  if (values.some((value, index) => value === next.value && index !== existingIndex))
    return 'That value already exists for this type.';
  if (values.length >= 10 && existing?.kind !== next.kind)
    return 'This URL type already has the maximum of 10 values.';
  return 'The value cannot be saved.';
}

/** Dialog that protects keyboard submission with the same validation used by its Save button. */
class AuthenticationUrlDialog extends Dialog {
  /** Creates one compact validated URL editor. */
  constructor(
    title: string,
    width: number,
    height: number,
    private readonly canSave: () => boolean,
    private readonly valueInput: Input,
  ) {
    super({ title, width, height, centered: true });
  }

  /** Rejects invalid default-command submission and focuses the value field. */
  override valid(command: string): boolean {
    if (command === Commands.cancel || this.canSave()) return super.valid(command);
    this.firstInvalid = this.valueInput;
    return false;
  }
}

/** Returns a compact dialog size capped to the terminal surface. */
function dialogSize(
  host: ClientAuthenticationDialogHost,
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
  host: ClientAuthenticationDialogHost,
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

/** Opens one compact direct form that adds or edits a single typed URL or origin. */
export async function showAuthenticationUrlDialog(
  host: ClientAuthenticationDialogHost,
  operationSignal: AbortSignal,
  client: AdminClient,
  existing: AdminAuthenticationUrlRow | null,
): Promise<AuthenticationUrlDialogResult> {
  if (existing && rowIndex(client, existing) < 0) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 68, 13);
  const initialKind = existing?.kind ?? 'redirect';
  const choice = signal<AuthenticationUrlChoice | null>(
    AUTHENTICATION_URL_CHOICES.find((candidate) => candidate.kind === initialKind) ?? null,
  );
  const value = signal(existing?.value ?? '');
  const selector = new ComboBox<AuthenticationUrlChoice>({
    items: signal([...AUTHENTICATION_URL_CHOICES]), getText: (item) => item.label, value: choice,
    editable: false,
  });
  const valueInput = new Input({ value, maxLength: 2_048, validator: textValidator(0, 2_048) });
  const draft = (): AuthenticationUrlDraft => ({ kind: choice()?.kind ?? 'redirect', value: value() });
  const canSave = (): boolean => valueGuidance(client, existing, draft()) === '';
  const dialog = new AuthenticationUrlDialog(
    existing ? 'Edit authentication URL' : 'Add authentication URL', width, height, canSave,
    valueInput,
  );
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text(`Client: ${client.clientName}`), 1),
        fixed(row({ gap: 1 }, fixed(new Label('Type', selector), 14), grow(selector)), 1),
        fixed(row({ gap: 1 }, fixed(new Label('URL / origin', valueInput), 14), grow(valueInput)), 1),
        grow(new Text(() => valueGuidance(client, existing, draft()))),
        fixed(
          row(
            { gap: 1 }, spacer(),
            new Button(existing ? '~S~ave' : '~A~dd', {
              command: Commands.ok, default: true, disabled: () => !canSave(),
            }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  return { kind: 'save', row: { kind: choice.peek()?.kind ?? 'redirect', value: value.peek() } };
}

/** Opens a safe-default confirmation before permanently removing one URL or origin. */
export async function showDeleteAuthenticationUrlDialog(
  host: ClientAuthenticationDialogHost,
  operationSignal: AbortSignal,
  client: AdminClient,
  target: AdminAuthenticationUrlRow,
): Promise<DeleteAuthenticationUrlDialogResult> {
  if (!buildAuthenticationUrlUpdate(client, { kind: 'delete', previous: target }))
    return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 72, 13);
  const keep = new Button('Keep', { command: Commands.cancel, default: true });
  const remove = new Button('Delete', { command: Commands.yes });
  const dialog = new Dialog({ title: 'Delete authentication URL', width, height, centered: true });
  const confirmation = deleteConfirmationLayout({
    dialogWidth: width,
    details: `Client: ${client.clientName}\nType: ${target.type}\nValue: ${target.value}`,
    warning: 'Deleting this authentication URL is permanent.', keep, remove,
  });
  dialog.add(cover(confirmation.content));
  const outcome = runDialog(host, dialog, operationSignal);
  host.loop.focusView(keep);
  return (await outcome) === Commands.yes ? { kind: 'delete' } : { kind: 'cancel' };
}
