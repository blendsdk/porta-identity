/** Organization and identity dialogs for the embedded administration application. */

import type { CreateOrganizationInput } from '@portaidentity/sdk';
import {
  at,
  Button,
  Commands,
  Dialog,
  Input,
  Label,
  ListView,
  signal,
  stringWidth,
  Text,
} from '@jsvision/ui';
import type { DispatchEvent, ModalDialogHost, Signal, Validator } from '@jsvision/ui';

import { normalizeServerOrigin } from '../global-options.js';
import type {
  AdminCapabilities,
  AdminConnectionState,
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
}

/** User choice returned by the organization chooser. */
export type OrganizationChoiceResult =
  | { readonly kind: 'switch'; readonly organization: AdminOrganizationContext }
  | { readonly kind: 'create' }
  | { readonly kind: 'reauthenticate' }
  | { readonly kind: 'cancel' };

/** User choice returned by the create-organization form. */
export type CreateOrganizationDialogResult =
  | { readonly kind: 'create'; readonly input: CreateOrganizationInput }
  | { readonly kind: 'cancel' };

/** Maximum number of terminal cells used for one organization row. */
const ORGANIZATION_ROW_WIDTH = 68;

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

/** Shows trusted identity details and restores the previously focused control on close. */
export async function showWhoAmIDialog(
  host: ModalDialogHost,
  state: AuthenticatedAdminState,
  insecure: boolean,
): Promise<void> {
  const { width, height } = dialogSize(host, 58, 12);
  const lines = [
    `Server: ${normalizeServerOrigin(state.server).origin}`,
    'State: Authenticated',
    `Name: ${safeIdentityText(state.identity.name, 'Verified administrator')}`,
    `Email: ${safeIdentityText(state.identity.email, 'Not provided')}`,
  ];
  if (insecure) lines.push('Warning: insecure TLS verification is enabled.');

  const dialog = new Dialog({ title: 'Who am I', width, height, centered: true });
  dialog.add(at(new Text(lines.join('\n')), 2, 1, Math.max(1, width - 6), Math.max(1, height - 6)));
  dialog.add(
    at(
      new Button('~O~K', { command: Commands.ok, default: true }),
      Math.max(1, Math.floor((width - 12) / 2)),
      Math.max(1, height - 5),
      10,
      2,
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
    options.capabilities.canReadOrganizations
      ? 'Loading organizations'
      : 'Organization listing unavailable',
  );
  const selected = signal(-1);
  const list = new OrganizationListView(organizations, selected);
  const dialog = new Dialog({ title: 'Organizations', width, height, centered: true });
  dialog.add(at(new Text(() => message()), 2, 1, Math.max(1, width - 6), 1));
  dialog.add(at(list, 2, 3, Math.max(1, width - 6), Math.max(1, height - 9)));

  const createAllowed = options.capabilities.canCreateOrganizations;
  if (createAllowed) {
    dialog.add(
      at(new Button('~C~reate', { command: Commands.yes }), 14, Math.max(1, height - 5), 12, 2),
    );
  } else {
    dialog.add(
      at(
        new Text('Create organization… (requires organization create)'),
        2,
        Math.max(1, height - 8),
        Math.max(1, width - 6),
        1,
      ),
    );
  }
  if (options.capabilities.canReadOrganizations) {
    dialog.add(
      at(
        new Button('~S~witch', { command: Commands.ok, disabled: () => selected() < 0 }),
        27,
        Math.max(1, height - 5),
        12,
        2,
      ),
    );
  } else {
    dialog.add(
      at(
        new Text('Switch organization… (requires organization read)'),
        2,
        Math.max(1, height - 7),
        Math.max(1, width - 6),
        1,
      ),
    );
  }
  dialog.add(
    at(
      new Button('~R~eauthenticate', { command: Commands.no }),
      Math.max(40, width - 24),
      Math.max(1, height - 5),
      18,
      2,
    ),
  );
  dialog.add(
    at(new Button('Cancel', { command: Commands.cancel }), 2, Math.max(1, height - 5), 10, 2),
  );

  if (options.organizations && options.capabilities.canReadOrganizations) {
    void options.organizations.then((result) => {
      if (result.kind !== 'success') {
        message.set(chooserMessage(result));
        return;
      }
      organizations.set([...result.value]);
      message.set(
        result.value.length === 0 ? 'No organizations available' : 'Select an organization',
      );
    });
  }

  const command = await runDialog(host, dialog);
  if (command === Commands.yes && createAllowed) return { kind: 'create' };
  if (command === Commands.no) return { kind: 'reauthenticate' };
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
  const inputWidth = Math.max(1, width - 23);
  const dialog = new Dialog({ title: 'Create organization', width, height, centered: true });
  dialog.add(at(new Label('~N~ame', nameInput), 2, 1, 17, 1));
  dialog.add(at(nameInput, 19, 1, inputWidth, 1));
  dialog.add(at(new Label('~S~lug', slugInput), 2, 3, 17, 1));
  dialog.add(at(slugInput, 19, 3, inputWidth, 1));
  dialog.add(at(new Label('~D~efault locale', localeInput), 2, 5, 17, 1));
  dialog.add(at(localeInput, 19, 5, inputWidth, 1));
  dialog.add(
    at(
      new Button('~C~reate', { command: Commands.ok, default: true }),
      Math.max(2, width - 27),
      Math.max(1, height - 5),
      12,
      2,
    ),
  );
  dialog.add(
    at(
      new Button('Cancel', { command: Commands.cancel }),
      Math.max(2, width - 14),
      Math.max(1, height - 5),
      10,
      2,
    ),
  );

  const command = await runDialog(host, dialog);
  if (command !== Commands.ok) return { kind: 'cancel' };
  const input: CreateOrganizationInput = { name: name.peek() };
  if (slug.peek()) input.slug = slug.peek();
  if (defaultLocale.peek()) input.defaultLocale = defaultLocale.peek();
  return { kind: 'create', input };
}
