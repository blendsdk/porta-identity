/** Focused modal dialogs for user administration. */

import type { UpdateUserInput } from '@portaidentity/sdk';
import {
  at,
  Button,
  CheckGroup,
  Commands,
  Dialog,
  Group,
  Input,
  signal,
  TabView,
  Text,
} from '@jsvision/ui';
import type { EventLoop, ModalDialogHost, Tab } from '@jsvision/ui';

import type {
  AdminCreateUserInput,
  AdminInviteUserInput,
  AdminSetPasswordInput,
  AdminUserReadResult,
} from './user-service.js';
import type { AdminInvitationPreview, AdminUserDetail } from './user-state.js';
import { runAbortableAdminDialog } from './application-runtime.js';
import {
  addCreateProfile,
  addField,
  profileInput,
  profileSignals,
  profileTabs,
  SecretInput,
  textValidator,
  validInputs,
} from './user-dialog-fields.js';
import type { ProfileSignals } from './user-dialog-fields.js';

/** Result of the create-user dialog. */
export type CreateUserDialogResult =
  { readonly kind: 'create'; readonly input: AdminCreateUserInput } | { readonly kind: 'cancel' };

/** Result of the invite-user dialog. */
export type InviteUserDialogResult =
  { readonly kind: 'invite'; readonly input: AdminInviteUserInput } | { readonly kind: 'cancel' };

/** Result of the profile editor. */
export type EditUserDialogResult =
  { readonly kind: 'update'; readonly input: UpdateUserInput } | { readonly kind: 'cancel' };

/** Result of the set-password dialog. */
export type SetUserPasswordDialogResult =
  | { readonly kind: 'set-password'; readonly input: AdminSetPasswordInput }
  | { readonly kind: 'cancel' };

/** User actions that require a simple explicit modal activation. */
export type UserConfirmationAction =
  'clear-password' | 'verify-email' | 'unsuspend' | 'unlock' | 'deactivate' | 'reactivate';

/** Result of a simple explicit user confirmation. */
export type UserConfirmationDialogResult =
  { readonly kind: UserConfirmationAction } | { readonly kind: 'cancel' };

/** Result of a lifecycle action that accepts a reason. */
export type UserReasonDialogResult =
  | { readonly kind: 'suspend'; readonly reason?: string }
  | { readonly kind: 'lock'; readonly reason: string }
  | { readonly kind: 'cancel' };

/** Result of the irreversible purge dialog. */
export type PurgeUserDialogResult = { readonly kind: 'purge' } | { readonly kind: 'cancel' };

/** Modal host used by user dialogs, including synchronous abort-driven closure. */
export interface AdminUserDialogHost extends ModalDialogHost {
  /** Event loop that can close the currently owned modal when its operation is aborted. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Returns a dialog size capped to the current terminal surface. */
function dialogSize(
  host: AdminUserDialogHost,
  preferredWidth: number,
  preferredHeight: number,
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, Math.min(preferredWidth, host.desktop.bounds.width)),
    height: Math.max(1, Math.min(preferredHeight, host.desktop.bounds.height)),
  };
}

/** Converts an abort into the ordinary dialog cancellation command. */
async function runDialog(
  host: AdminUserDialogHost,
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

/** Shows the complete create-user form and clears password signals on every exit. */
export async function showCreateUserDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
): Promise<CreateUserDialogResult> {
  const { width, height } = dialogSize(host, 76, 23);
  const email = signal('');
  const values = profileSignals();
  const password = signal('');
  const confirmation = signal('');
  const emailInput = new Input({
    value: email,
    maxLength: 255,
    validator: textValidator(3, 255, false),
  });
  const givenNameInput = profileInput(values.givenName, 255);
  const familyNameInput = profileInput(values.familyName, 255);
  const passwordInput = new SecretInput({
    value: password,
    maxLength: 128,
    validator: textValidator(8, 128),
  });
  const confirmationInput = new SecretInput({
    value: confirmation,
    maxLength: 128,
    validator: textValidator(8, 128),
  });
  const basic = new Group();
  addField(basic, 'Email', emailInput, 1, width - 4);
  addField(basic, 'Given name', givenNameInput, 3, width - 4);
  addField(basic, 'Family name', familyNameInput, 5, width - 4);
  addField(basic, 'Password', passwordInput, 7, width - 4);
  addField(basic, 'Confirm password', confirmationInput, 9, width - 4);
  const tabs = signal<Tab[]>([
    { title: '~B~asic', content: basic },
    ...profileTabs(values, width - 4),
  ]);
  const dialog = new Dialog({ title: 'Create user', width, height, centered: true });
  dialog.add(
    at(
      new TabView({ tabs, active: signal(0) }),
      1,
      1,
      Math.max(1, width - 4),
      Math.max(1, height - 7),
    ),
  );
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
  const inputs = [emailInput, givenNameInput, familyNameInput, passwordInput, confirmationInput];
  for (const tab of tabs.peek().slice(1)) {
    for (const child of tab.content.children) if (child instanceof Input) inputs.push(child);
  }

  try {
    while (true) {
      const command = await runDialog(host, dialog, operationSignal);
      if (command !== Commands.ok) return { kind: 'cancel' };
      if (
        !validInputs(inputs) ||
        !email.peek().includes('@') ||
        password.peek() !== confirmation.peek()
      )
        continue;
      const input: AdminCreateUserInput = {
        email: email.peek(),
        ...(password.peek()
          ? { password: password.peek(), passwordConfirmation: confirmation.peek() }
          : {}),
      };
      addCreateProfile(input, values);
      return { kind: 'create', input };
    }
  } finally {
    password.set('');
    confirmation.set('');
  }
}

/** Shows a bounded plain-text invitation preview. */
async function showInvitationPreview(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  preview: AdminInvitationPreview,
): Promise<void> {
  const { width, height } = dialogSize(host, 72, 20);
  const dialog = new Dialog({ title: 'Invitation preview', width, height, centered: true });
  dialog.add(
    at(
      new Text(`Subject: ${preview.subject}\n\n${preview.text}`),
      2,
      1,
      Math.max(1, width - 6),
      Math.max(1, height - 6),
    ),
  );
  dialog.add(
    at(
      new Button('~O~K', { command: Commands.ok, default: true }),
      Math.max(2, width - 13),
      Math.max(1, height - 5),
      10,
      2,
    ),
  );
  await runDialog(host, dialog, operationSignal);
}

/** Shows the invite form with a same-input, non-assignment preview action. */
export async function showInviteUserDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  loadPreview: (
    input: AdminInviteUserInput,
  ) => Promise<AdminUserReadResult<AdminInvitationPreview>>,
): Promise<InviteUserDialogResult> {
  const { width, height } = dialogSize(host, 68, 18);
  const email = signal('');
  const givenName = signal('');
  const familyName = signal('');
  const locale = signal('');
  const personalMessage = signal('');
  const message = signal('');
  const inputs = [
    new Input({ value: email, maxLength: 255, validator: textValidator(3, 255, false) }),
    new Input({ value: givenName, maxLength: 255, validator: textValidator(1, 255) }),
    new Input({ value: familyName, maxLength: 255, validator: textValidator(1, 255) }),
    new Input({ value: locale, maxLength: 10, validator: textValidator(0, 10) }),
    new Input({ value: personalMessage, maxLength: 500, validator: textValidator(0, 500) }),
  ];
  const dialog = new Dialog({ title: 'Invite user', width, height, centered: true });
  ['Email', 'Given name', 'Family name', 'Locale', 'Personal message'].forEach((label, index) =>
    addField(dialog, label, inputs[index]!, 1 + index * 2, width),
  );
  dialog.add(at(new Text(message), 2, 11, Math.max(1, width - 6), 1));
  let previewBusy = false;
  let parentOpen = true;
  let previewGeneration = 0;
  const collect = (): AdminInviteUserInput | undefined => {
    if (!validInputs(inputs) || !email.peek().includes('@')) return undefined;
    return {
      email: email.peek(),
      ...(givenName.peek() ? { givenName: givenName.peek() } : {}),
      ...(familyName.peek() ? { familyName: familyName.peek() } : {}),
      ...(locale.peek() ? { locale: locale.peek() } : {}),
      ...(personalMessage.peek() ? { personalMessage: personalMessage.peek() } : {}),
    };
  };
  const previewButton = new Button('~P~review', {
    disabled: () => previewBusy,
    onClick: () => {
      const input = collect();
      if (!input || previewBusy) {
        message.set('Validation failed');
        return;
      }
      previewBusy = true;
      const generation = ++previewGeneration;
      void loadPreview(input)
        .then(async (result) => {
          if (!parentOpen || generation !== previewGeneration || operationSignal.aborted) return;
          if (result.kind === 'success')
            await showInvitationPreview(host, operationSignal, result.value);
          else if (parentOpen && generation === previewGeneration)
            message.set(
              result.kind === 'session-invalid'
                ? 'Authentication is required'
                : result.failure === 'invalid-response'
                  ? 'Invalid server response'
                  : 'Preview unavailable',
            );
        })
        .finally(() => {
          if (parentOpen && generation === previewGeneration) previewBusy = false;
        });
    },
  });
  dialog.add(at(previewButton, Math.max(2, width - 39), Math.max(1, height - 5), 12, 2));
  dialog.add(
    at(
      new Button('~I~nvite', {
        command: Commands.ok,
        default: true,
        disabled: () => previewBusy,
      }),
      Math.max(2, width - 26),
      Math.max(1, height - 5),
      11,
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

  try {
    while (true) {
      const command = await runDialog(host, dialog, operationSignal);
      if (command !== Commands.ok) return { kind: 'cancel' };
      if (previewBusy) continue;
      const input = collect();
      if (input) return { kind: 'invite', input };
      message.set('Validation failed');
    }
  } finally {
    parentOpen = false;
    previewGeneration += 1;
  }
}

/** Adds one changed profile field, using null for an explicit clear. */
function changedField(
  input: UpdateUserInput,
  key: keyof UpdateUserInput,
  current: string,
  original: string | null,
): void {
  if (current !== (original ?? '')) Object.assign(input, { [key]: current || null });
}

/** Shows a read-only-email profile editor and returns only touched fields. */
export async function showEditUserDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  detail: AdminUserDetail,
): Promise<EditUserDialogResult> {
  const { width, height } = dialogSize(host, 76, 23);
  const values = profileSignals(detail);
  const givenNameInput = profileInput(values.givenName, 255);
  const familyNameInput = profileInput(values.familyName, 255);
  const basic = new Group();
  basic.add(at(new Text(`Email: ${detail.email} (read only)`), 1, 1, Math.max(1, width - 8), 1));
  addField(basic, 'Given name', givenNameInput, 3, width - 4);
  addField(basic, 'Family name', familyNameInput, 5, width - 4);
  const verified = signal([detail.phoneNumberVerified]);
  const verification = new CheckGroup({ labels: ['Phone number ~v~erified'], value: verified });
  basic.add(at(verification, 1, 7, 30, 1));
  const tabs = signal<Tab[]>([
    { title: '~B~asic', content: basic },
    ...profileTabs(values, width - 4),
  ]);
  const dialog = new Dialog({ title: 'Edit user', width, height, centered: true });
  dialog.add(
    at(
      new TabView({ tabs, active: signal(0) }),
      1,
      1,
      Math.max(1, width - 4),
      Math.max(1, height - 7),
    ),
  );
  dialog.add(
    at(
      new Button('~S~ave', { command: Commands.ok, default: true }),
      Math.max(2, width - 25),
      Math.max(1, height - 5),
      10,
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
  const inputs = [givenNameInput, familyNameInput];
  for (const tab of tabs.peek().slice(1)) {
    for (const child of tab.content.children) if (child instanceof Input) inputs.push(child);
  }

  while (true) {
    const command = await runDialog(host, dialog, operationSignal);
    if (command !== Commands.ok) return { kind: 'cancel' };
    if (!validInputs(inputs)) continue;
    const input: UpdateUserInput = {};
    const fields: ReadonlyArray<
      readonly [keyof UpdateUserInput, keyof ProfileSignals, string | null]
    > = [
      ['givenName', 'givenName', detail.givenName],
      ['familyName', 'familyName', detail.familyName],
      ['middleName', 'middleName', detail.middleName],
      ['nickname', 'nickname', detail.nickname],
      ['preferredUsername', 'preferredUsername', detail.preferredUsername],
      ['profileUrl', 'profileUrl', detail.profileUrl],
      ['pictureUrl', 'pictureUrl', detail.pictureUrl],
      ['websiteUrl', 'websiteUrl', detail.websiteUrl],
      ['gender', 'gender', detail.gender],
      ['birthdate', 'birthdate', detail.birthdate],
      ['zoneinfo', 'zoneinfo', detail.zoneinfo],
      ['locale', 'locale', detail.locale],
      ['phoneNumber', 'phoneNumber', detail.phoneNumber],
    ];
    for (const [key, source, original] of fields)
      changedField(input, key, values[source].peek(), original);
    if (verified.peek()[0] !== detail.phoneNumberVerified)
      input.phoneNumberVerified = Boolean(verified.peek()[0]);
    const address: NonNullable<UpdateUserInput['address']> = {};
    const addressFields = [
      ['street', 'addressStreet', detail.addressStreet],
      ['locality', 'addressLocality', detail.addressLocality],
      ['region', 'addressRegion', detail.addressRegion],
      ['postalCode', 'addressPostalCode', detail.addressPostalCode],
      ['country', 'addressCountry', detail.addressCountry],
    ] as const;
    for (const [key, source, original] of addressFields) {
      const current = values[source].peek();
      if (current !== (original ?? '')) address[key] = current || null;
    }
    if (Object.keys(address).length > 0) input.address = address;
    return { kind: 'update', input };
  }
}

/** Shows a masked set-password form and clears both secret signals on every exit. */
export async function showSetUserPasswordDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  email: string,
): Promise<SetUserPasswordDialogResult> {
  const { width, height } = dialogSize(host, 62, 14);
  const password = signal('');
  const confirmation = signal('');
  const passwordInput = new SecretInput({
    value: password,
    maxLength: 128,
    validator: textValidator(8, 128, false),
  });
  const confirmationInput = new SecretInput({
    value: confirmation,
    maxLength: 128,
    validator: textValidator(8, 128, false),
  });
  const dialog = new Dialog({ title: 'Set password', width, height, centered: true });
  dialog.add(at(new Text(`User: ${email}`), 2, 1, Math.max(1, width - 6), 1));
  addField(dialog, 'Password', passwordInput, 3, width);
  addField(dialog, 'Confirm password', confirmationInput, 5, width);
  dialog.add(
    at(
      new Button('~S~et password', { command: Commands.ok, default: true }),
      Math.max(2, width - 32),
      Math.max(1, height - 5),
      17,
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
  try {
    while (true) {
      const command = await runDialog(host, dialog, operationSignal);
      if (command !== Commands.ok) return { kind: 'cancel' };
      if (
        validInputs([passwordInput, confirmationInput]) &&
        password.peek() === confirmation.peek()
      ) {
        return {
          kind: 'set-password',
          input: { password: password.peek(), passwordConfirmation: confirmation.peek() },
        };
      }
    }
  } finally {
    password.set('');
    confirmation.set('');
  }
}

/** Shows one explicit user action with its exact email target. */
export async function showUserConfirmationDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  action: UserConfirmationAction,
  email: string,
): Promise<UserConfirmationDialogResult> {
  const labels: Readonly<Record<UserConfirmationAction, string>> = {
    'clear-password': 'Clear password',
    'verify-email': 'Verify email',
    unsuspend: 'Unsuspend',
    unlock: 'Unlock',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
  };
  const { width, height } = dialogSize(host, 58, 11);
  const label = labels[action];
  const targetState =
    action === 'deactivate' ? 'inactive' : action === 'reactivate' ? 'active' : undefined;
  const dialog = new Dialog({ title: label, width, height, centered: true });
  dialog.add(
    at(
      new Text(`${label} for ${email}?${targetState ? `\nTarget state: ${targetState}` : ''}`),
      2,
      1,
      Math.max(1, width - 6),
      2,
    ),
  );
  dialog.add(
    at(
      new Button(label, { command: Commands.ok, default: true }),
      Math.max(2, width - 29),
      Math.max(1, height - 5),
      15,
      2,
    ),
  );
  dialog.add(
    at(
      new Button('Cancel', { command: Commands.cancel }),
      Math.max(2, width - 13),
      Math.max(1, height - 5),
      10,
      2,
    ),
  );
  return (await runDialog(host, dialog, operationSignal)) === Commands.ok
    ? { kind: action }
    : { kind: 'cancel' };
}

/** Shows suspend or lock input with the required reason rule. */
export async function showUserReasonDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  action: 'suspend' | 'lock',
  email: string,
): Promise<UserReasonDialogResult> {
  const { width, height } = dialogSize(host, 62, 13);
  const reason = signal('');
  const reasonInput = new Input({
    value: reason,
    maxLength: 500,
    validator: textValidator(action === 'lock' ? 1 : 0, 500, action === 'suspend'),
  });
  const dialog = new Dialog({
    title: action === 'lock' ? 'Lock user' : 'Suspend user',
    width,
    height,
    centered: true,
  });
  dialog.add(
    at(
      new Text(`User: ${email}\nTarget state: ${action === 'lock' ? 'locked' : 'suspended'}`),
      2,
      1,
      Math.max(1, width - 6),
      2,
    ),
  );
  addField(dialog, 'Reason', reasonInput, 4, width);
  dialog.add(
    at(
      new Button(action === 'lock' ? 'Lock' : 'Suspend', { command: Commands.ok, default: true }),
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
  while (true) {
    const command = await runDialog(host, dialog, operationSignal);
    if (command !== Commands.ok) return { kind: 'cancel' };
    if (!reasonInput.valid()) continue;
    if (action === 'lock') return { kind: 'lock', reason: reason.peek() };
    return reason.peek() ? { kind: 'suspend', reason: reason.peek() } : { kind: 'suspend' };
  }
}

/** Shows the irreversible purge warning with Cancel initially focused. */
export async function showPurgeUserDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  email: string,
): Promise<PurgeUserDialogResult> {
  const { width, height } = dialogSize(host, 64, 12);
  const dialog = new Dialog({ title: 'Purge user', width, height, centered: true });
  dialog.add(
    at(
      new Text(`User: ${email}\nThis permanently removes the user and cannot be undone.`),
      2,
      1,
      Math.max(1, width - 6),
      3,
    ),
  );
  dialog.add(
    at(
      new Button('Cancel', { command: Commands.cancel, default: true }),
      Math.max(2, width - 34),
      Math.max(1, height - 5),
      10,
      2,
    ),
  );
  dialog.add(
    at(
      new Button('Purge permanently', { command: Commands.yes }),
      Math.max(2, width - 23),
      Math.max(1, height - 5),
      20,
      2,
    ),
  );
  return (await runDialog(host, dialog, operationSignal)) === Commands.yes
    ? { kind: 'purge' }
    : { kind: 'cancel' };
}
