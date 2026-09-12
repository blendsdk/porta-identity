/** Organization and identity dialogs for the embedded administration application. */

import type { CreateOrganizationInput } from '@portaidentity/sdk';
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
  ListView,
  row,
  signal,
  spacer,
  stringWidth,
  Text,
} from '@jsvision/ui';
import type { DispatchEvent, EventLoop, ModalDialogHost, Signal, Validator } from '@jsvision/ui';

import { normalizeServerOrigin } from '../global-options.js';
import { runAbortableAdminDialog } from './application-runtime.js';
import { deleteActionLabel, deleteConfirmationLayout } from './delete-confirmation-layout.js';
import type {
  AdminCapabilities,
  AdminConnectionState,
  AdminOrganizationFailureKind,
  AdminOrganizationContext,
  AdminOrganizationResult,
} from './state.js';

/** Authenticated state accepted by the read-only identity dialog. */
export type AuthenticatedAdminState = Extract<
  AdminConnectionState,
  { readonly kind: 'authenticated' }
>;

/** Inputs supplied by the application-owned organization listing operation. */
export interface OrganizationChooserOptions {
  /** Capabilities from the current live verified session. */
  readonly capabilities: AdminCapabilities;
  /** Current list operation, omitted when listing is not allowed. */
  readonly organizations?: Promise<AdminOrganizationResult<readonly AdminOrganizationContext[]>>;
  /** Fixed failure retained while an authoritative organization list is reloaded. */
  readonly failure?: AdminOrganizationFailureKind;
}

/** User choice returned by the organization chooser. */
export type OrganizationChoiceResult =
  | { readonly kind: 'switch'; readonly organization: AdminOrganizationContext }
  | { readonly kind: 'delete'; readonly organization: AdminOrganizationContext }
  | { readonly kind: 'create' }
  | { readonly kind: 'reauthenticate' }
  | { readonly kind: 'cancel' };

/** User choice returned by the create-organization form. */
export type CreateOrganizationDialogResult =
  | { readonly kind: 'create'; readonly input: CreateOrganizationInput }
  | { readonly kind: 'cancel' };

/** Result of the irreversible organization-deletion dialog. */
export type DeleteOrganizationDialogResult =
  { readonly kind: 'delete'; readonly organizationId: string } | { readonly kind: 'cancel' };

/** Modal host needed for abort-driven organization deletion confirmation. */
export interface AdminOrganizationDeleteDialogHost extends ModalDialogHost {
  /** Event loop that can close an owned modal when its operation is cancelled. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Explicit choice returned by the blocking unauthenticated gate. */
export type AuthenticationGateChoice = 'authenticate' | 'quit';

/** Maximum number of terminal cells used for one organization row. */
const ORGANIZATION_ROW_WIDTH = 68;
const DELETE_ORGANIZATION_COMMAND = 'admin:delete-organization';

/** Dialog that keeps an unauthenticated user inside the Authenticate-or-Quit decision. */
class AuthenticationGateDialog extends Dialog {
  /** Lets the global Quit shortcut close this modal before the application handles Quit. */
  onEvent(event: DispatchEvent): void {
    if (event.event.type === 'command' && event.event.command === Commands.quit && this.modalHost) {
      this.modalHost.endModal(Commands.quit);
      this.modalHost = null;
      event.handled = true;
      return;
    }
    super.onEvent(event);
  }

  /** Ignores Escape so the unusable application beneath the gate cannot be exposed. */
  protected resolveCancel(event: DispatchEvent): void {
    event.handled = true;
  }
}

/** Quit button that treats Enter like Space while focused instead of invoking the default button. */
class AuthenticationQuitButton extends Button {
  /** Exits on focused Enter and delegates every other activation to the standard button. */
  onEvent(event: DispatchEvent): void {
    if (event.event.type === 'key' && event.event.key === 'enter' && this.state.focused) {
      event.emit?.(Commands.no);
      event.handled = true;
      return;
    }
    super.onEvent(event);
  }
}

/** Organization list that also accepts a literal decoded space key for activation. */
class OrganizationListView extends ListView<AdminOrganizationContext> {
  /** Creates the fixed, order-preserving organization list. */
  constructor(
    private readonly currentItems: Signal<AdminOrganizationContext[]>,
    selected: Signal<number>,
  ) {
    super({
      items: currentItems,
      getText: organizationRow,
      selected,
      sorted: false,
      command: Commands.ok,
    });
  }

  /** Treats a literal space exactly like JSVision's normalized `space` key. */
  onEvent(event: DispatchEvent): void {
    if (event.event.type === 'key' && event.event.key === ' ') {
      const index = this.focused.peek();
      if (this.currentItems.peek()[index]) {
        this.selected.set(index);
        event.emit?.(Commands.ok);
        event.handled = true;
      }
      return;
    }
    super.onEvent(event);
  }
}

/** Dialog that lets the organization-specific Delete command complete its modal session. */
class OrganizationChooserDialog extends Dialog {
  /** Routes Delete through the same enabled-state and validity checks as standard dialog actions. */
  onEvent(event: DispatchEvent): void {
    if (event.event.type === 'command' && event.event.command === DELETE_ORGANIZATION_COMMAND) {
      this.handleTerminating(DELETE_ORGANIZATION_COMMAND, event);
      return;
    }
    super.onEvent(event);
  }
}

/** Returns a dialog size capped to the currently available terminal surface. */
function dialogSize(
  host: ModalDialogHost,
  preferredWidth: number,
  preferredHeight: number,
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, Math.min(preferredWidth, host.desktop.bounds.width)),
    height: Math.max(1, Math.min(preferredHeight, host.desktop.bounds.height)),
  };
}

/** Mounts one dialog and guarantees removal after modal completion. */
async function runDialog(host: ModalDialogHost, dialog: Dialog): Promise<string> {
  host.desktop.addWindow(dialog);
  try {
    return (await host.loop.execView<string>(dialog)) ?? Commands.cancel;
  } finally {
    host.desktop.removeWindow(dialog);
  }
}

/** Runs one abortable organization dialog and always removes its window. */
async function runDeleteDialog(
  host: AdminOrganizationDeleteDialogHost,
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

/** Shows the mandatory authentication gate and returns one explicit user choice. */
export async function showAuthenticationGate(
  host: ModalDialogHost,
): Promise<AuthenticationGateChoice> {
  const { width, height } = dialogSize(host, 52, 10);
  const dialog = new AuthenticationGateDialog({
    title: 'Authentication required',
    width,
    height,
    centered: true,
  });
  dialog.closable = false;
  dialog.add(
    cover(
      col(
        { padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text('Authenticate with Porta to continue.'), 1),
        spacer(),
        fixed(
          row(
            { gap: 1, justify: 'end' },
            new Button('~A~uthenticate', { command: Commands.ok, default: true }),
            new AuthenticationQuitButton('~Q~uit', { command: Commands.no }),
          ),
          2,
        ),
      ),
    ),
  );

  return (await runDialog(host, dialog)) === Commands.ok ? 'authenticate' : 'quit';
}

/** Accepts a bounded, control-free identity value or returns a fixed fallback. */
function safeIdentityText(value: string | undefined, fallback: string): string {
  if (!value || value.length > 80) return fallback;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return fallback;
  }
  return value;
}

/** Removes a row at the first terminal control and clips it by display width. */
function clipDisplayText(value: string, maximumWidth: number): string {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) break;
    if (stringWidth(result + character) > maximumWidth) break;
    result += character;
  }
  return result;
}

/** Formats one already validated organization for a single terminal row. */
function organizationRow(organization: AdminOrganizationContext): string {
  return clipDisplayText(
    `${organization.name} (${organization.slug}) [${organization.status}]`,
    ORGANIZATION_ROW_WIDTH,
  );
}

/** Converts a fixed operation result into a safe chooser message. */
function chooserMessage(
  result: Exclude<
    AdminOrganizationResult<readonly AdminOrganizationContext[]>,
    { kind: 'success' }
  >,
): string {
  if (result.kind === 'session-invalid') return 'Authentication is required.';
  switch (result.failure) {
    case 'validation':
      return 'Validation failed';
    case 'unauthorized':
      return 'Not authorized';
    case 'conflict':
      return 'Conflict';
    case 'unavailable':
      return 'Service unavailable';
    case 'invalid-response':
      return 'Invalid server response';
  }
}

/** Converts a retained fixed organization failure into the chooser's bounded message. */
function organizationFailureMessage(failure: AdminOrganizationFailureKind): string {
  return chooserMessage({ kind: 'failure', failure });
}

/** Shows trusted identity details and restores the previously focused control on close. */
export async function showWhoAmIDialog(
  host: ModalDialogHost,
  state: AuthenticatedAdminState,
  insecure: boolean,
): Promise<void> {
  const { width, height } = dialogSize(host, 58, 12);
  const lines = [
    `Server: ${normalizeServerOrigin(state.server).origin}`,
    `Authenticated — Name: ${safeIdentityText(state.identity.name, 'Verified administrator')}`,
    `Email: ${safeIdentityText(state.identity.email, 'Not provided')}`,
  ];
  if (insecure) lines.push('Warning: insecure TLS verification.');

  const dialog = new Dialog({ title: 'Who am I', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { padding: { top: 1, right: 2, bottom: 0, left: 2 } },
        fixed(new Text(lines.join('\n')), lines.length),
        spacer(),
        fixed(
          row({ justify: 'center' }, new Button('~O~K', { command: Commands.ok, default: true })),
          2,
        ),
      ),
    ),
  );
  await runDialog(host, dialog);
}

/** Shows the organization list and returns only an explicit typed choice. */
export async function showOrganizationChooser(
  host: ModalDialogHost,
  options: OrganizationChooserOptions,
): Promise<OrganizationChoiceResult> {
  const { width, height } = dialogSize(host, 76, 18);
  const organizations = signal<AdminOrganizationContext[]>([]);
  const message = signal(
    options.failure
      ? organizationFailureMessage(options.failure)
      : options.capabilities.canReadOrganizations
        ? 'Loading organizations'
        : 'Organization listing unavailable',
  );
  const selected = signal(-1);
  const list = new OrganizationListView(organizations, selected);
  const dialog = new OrganizationChooserDialog({
    title: 'Organizations',
    width,
    height,
    centered: true,
  });
  const createAllowed = options.capabilities.canCreateOrganizations;
  const chooserActions = row(
    { gap: 1 },
    new Button('Cancel', { command: Commands.cancel }),
    createAllowed && new Button('~C~reate', { command: Commands.yes }),
    options.capabilities.canReadOrganizations &&
      new Button('~S~witch', { command: Commands.ok, disabled: () => selected() < 0 }),
    options.capabilities.canDeleteOrganizations &&
      new Button('Delete', {
        command: DELETE_ORGANIZATION_COMMAND,
        disabled: () => {
          const organization = organizations()[selected()];
          return !organization || organization.isSuperAdmin === true;
        },
      }),
    spacer(),
    new Button('~R~eauthenticate', { command: Commands.no }),
  );
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text(() => message()), 1),
        grow(list),
        !createAllowed &&
          fixed(new Text('Create organization… (requires organization create)'), 1),
        !options.capabilities.canReadOrganizations &&
          fixed(new Text('Switch organization… (requires organization read)'), 1),
        fixed(chooserActions, 2),
      ),
    ),
  );

  if (options.organizations && options.capabilities.canReadOrganizations) {
    void options.organizations.then((result) => {
      if (result.kind !== 'success') {
        message.set(chooserMessage(result));
        return;
      }
      organizations.set([...result.value]);
      if (!options.failure) {
        message.set(
          result.value.length === 0 ? 'No organizations available' : 'Select an organization',
        );
      }
    });
  }

  const command = await runDialog(host, dialog);
  if (command === Commands.yes && createAllowed) return { kind: 'create' };
  if (command === Commands.no) return { kind: 'reauthenticate' };
  if (command === DELETE_ORGANIZATION_COMMAND) {
    const organization = organizations.peek()[selected.peek()];
    if (organization && !organization.isSuperAdmin) return { kind: 'delete', organization };
  }
  if (command === Commands.ok) {
    const organization = organizations.peek()[selected.peek()];
    if (organization) return { kind: 'switch', organization };
  }
  return { kind: 'cancel' };
}

/** Builds a validator whose live gate permits editing and whose final gate enforces length bounds. */
function lengthValidator(minimum: number, maximum: number, optional = false): Validator {
  return {
    isValidInput: (value) => value.length <= maximum,
    isValid: (value) =>
      (optional && value.length === 0) || (value.length >= minimum && value.length <= maximum),
  };
}

/** Shows the bounded create form and omits blank optional fields from its result. */
export async function showCreateOrganizationDialog(
  host: ModalDialogHost,
): Promise<CreateOrganizationDialogResult> {
  const { width, height } = dialogSize(host, 62, 14);
  const name = signal('');
  const slug = signal('');
  const defaultLocale = signal('');
  const nameInput = new Input({ value: name, maxLength: 255, validator: lengthValidator(1, 255) });
  const slugInput = new Input({
    value: slug,
    maxLength: 100,
    validator: lengthValidator(3, 100, true),
  });
  const localeInput = new Input({
    value: defaultLocale,
    maxLength: 10,
    validator: lengthValidator(2, 10, true),
  });
  const dialog = new Dialog({ title: 'Create organization', width, height, centered: true });
  const field = (label: string, input: Input) =>
    fixed(row({ gap: 1 }, fixed(new Label(label, input), 17), grow(input)), 1);
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        field('~N~ame', nameInput),
        field('~S~lug', slugInput),
        field('~D~efault locale', localeInput),
        spacer(),
        fixed(
          row(
            { gap: 1, justify: 'end' },
            new Button('~C~reate', { command: Commands.ok, default: true }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );

  const command = await runDialog(host, dialog);
  if (command !== Commands.ok) return { kind: 'cancel' };
  const input: CreateOrganizationInput = { name: name.peek() };
  if (slug.peek()) input.slug = slug.peek();
  if (defaultLocale.peek()) input.defaultLocale = defaultLocale.peek();
  return { kind: 'create', input };
}

/** Shows the tenant-owned cascade before permanently deleting an organization. */
export async function showDeleteOrganizationDialog(
  host: AdminOrganizationDeleteDialogHost,
  operationSignal: AbortSignal,
  organization: AdminOrganizationContext,
): Promise<DeleteOrganizationDialogResult> {
  const { width, height } = dialogSize(host, 72, 14);
  const keep = new Button('Keep', { command: Commands.cancel, default: true });
  const remove = new Button(deleteActionLabel(organization.name, width), {
    command: Commands.yes,
  });
  const dialog = new Dialog({ title: 'Delete organization', width, height, centered: true });
  const confirmation = deleteConfirmationLayout({
    dialogWidth: width,
    details: `Organization: ${organization.name}`,
    warning: 'Deleting this organization removes its users, clients, and security data.',
    keep,
    remove,
  });
  dialog.add(cover(confirmation.content));
  const outcome = runDeleteDialog(host, dialog, operationSignal);
  host.loop.focusView(keep);
  return (await outcome) === Commands.yes
    ? { kind: 'delete', organizationId: organization.id }
    : { kind: 'cancel' };
}
