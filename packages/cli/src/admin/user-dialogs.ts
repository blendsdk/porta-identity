/** Focused modal dialogs for user administration. */

import type { UpdateUserInput } from '@portaidentity/sdk';
import {
  Button,
  CheckGroup,
  col,
  Commands,
  cover,
  Dialog,
  fixed,
  Group,
  grow,
  Input,
  Label,
  Memo,
  row,
  signal,
  spacer,
  TabView,
  Text,
} from '@jsvision/ui';
import type { Tab, View } from '@jsvision/ui';

import type {
  AdminCreateUserInput,
  AdminInviteUserInput,
  AdminSetPasswordInput,
  AdminUserReadResult,
} from './user-service.js';
import type { AdminInvitationPreview, AdminUserDetail } from './user-state.js';
import type { AdminOrganizationContext } from './state.js';
import { deleteActionLabel, deleteConfirmationLayout } from './delete-confirmation-layout.js';
import { showInviteRoleDialog } from './invite-role-dialog.js';
import type { AdminInviteRoleOption, AdminInviteRoleSource } from './invite-role-dialog.js';
import {
  actionRow,
  dialogSize,
  inputRow,
  runDialog,
  validMultilineText,
} from './user-dialog-support.js';
import type { AdminUserDialogHost } from './user-dialog-support.js';
import {
  addCreateProfile,
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
export type UserConfirmationAction = 'clear-password' | 'verify-email' | 'deactivate' | 'activate';

/** Result of a simple explicit user confirmation. */
export type UserConfirmationDialogResult =
  { readonly kind: UserConfirmationAction } | { readonly kind: 'cancel' };

/** Result of the irreversible user-deletion dialog. */
export type DeleteUserDialogResult = { readonly kind: 'delete' } | { readonly kind: 'cancel' };

export type { AdminUserDialogHost } from './user-dialog-support.js';

/** Collects nested inputs from Layout DSL groups for form-wide validation. */
function descendantInputs(root: View): Input[] {
  const result: Input[] = [];
  const visit = (view: View): void => {
    if (view instanceof Input) result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
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
  const emailValidator = textValidator(3, 255, false);
  const passwordValidator = textValidator(8, 128);
  const confirmationValidator = textValidator(8, 128);
  const emailInput = new Input({
    value: email,
    maxLength: 255,
    validator: emailValidator,
  });
  const givenNameInput = profileInput(values.givenName, 255);
  const familyNameInput = profileInput(values.familyName, 255);
  const passwordInput = new SecretInput({
    value: password,
    maxLength: 128,
    validator: passwordValidator,
  });
  const confirmationInput = new SecretInput({
    value: confirmation,
    maxLength: 128,
    validator: confirmationValidator,
  });
  const basic = new Group();
  basic.add(
    cover(
      col(
        { gap: 1, padding: 1 },
        inputRow('Email *', emailInput),
        inputRow('Given name', givenNameInput),
        inputRow('Family name', familyNameInput),
        inputRow('Password', passwordInput),
        inputRow('Confirm password', confirmationInput),
        fixed(new Text('* Required'), 1),
      ),
    ),
  );
  const tabs = signal<Tab[]>([
    { title: '~B~asic', content: basic },
    ...profileTabs(values),
  ]);
  const dialog = new Dialog({ title: 'Create user', width, height, centered: true });
  const inputs = [emailInput, givenNameInput, familyNameInput, passwordInput, confirmationInput];
  for (const tab of tabs.peek().slice(1)) inputs.push(...descendantInputs(tab.content));
  const canCreate = (): boolean => {
    const emailValue = email();
    const passwordValue = password();
    const confirmationValue = confirmation();
    const inputsAreBounded = inputs.every((input) =>
      textValidator(0, input.getMaxLength()).isValid(input.getValueSignal()()),
    );
    return (
      inputsAreBounded &&
      emailValidator.isValid(emailValue) &&
      emailValue.includes('@') &&
      passwordValidator.isValid(passwordValue) &&
      confirmationValidator.isValid(confirmationValue) &&
      passwordValue === confirmationValue
    );
  };
  const createButton = new Button('~C~reate', {
    command: Commands.ok,
    default: true,
    disabled: () => !canCreate(),
  });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        grow(new TabView({ tabs, active: signal(0) })),
        actionRow(createButton, new Button('Cancel', { command: Commands.cancel })),
      ),
    ),
  );

  try {
    while (true) {
      const command = await runDialog(host, dialog, operationSignal);
      if (command !== Commands.ok) return { kind: 'cancel' };
      if (!validInputs(inputs) || !canCreate()) continue;
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
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        grow(new Text(`Subject: ${preview.subject}\n\n${preview.text}`)),
        actionRow(new Button('~O~K', { command: Commands.ok, default: true })),
      ),
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
  roleSource?: AdminInviteRoleSource,
): Promise<InviteUserDialogResult> {
  const { width, height } = dialogSize(host, 68, roleSource ? 22 : 21);
  const email = signal('');
  const givenName = signal('');
  const familyName = signal('');
  const locale = signal('');
  const personalMessage = signal('');
  const message = signal('');
  const rolesSummary = signal('None');
  let selectedRoles: readonly AdminInviteRoleOption[] = [];
  const inputs = [
    new Input({ value: email, maxLength: 255, validator: textValidator(3, 255, false) }),
    new Input({ value: givenName, maxLength: 255, validator: textValidator(1, 255) }),
    new Input({ value: familyName, maxLength: 255, validator: textValidator(1, 255) }),
    new Input({ value: locale, maxLength: 10, validator: textValidator(0, 10) }),
  ];
  const personalMessageMemo = new Memo({ value: personalMessage });
  const dialog = new Dialog({ title: 'Invite user', width, height, centered: true });
  const previewBusy = signal(false);
  let parentOpen = true;
  let previewGeneration = 0;
  const collect = (): AdminInviteUserInput | undefined => {
    if (
      !validInputs(inputs) ||
      !email.peek().includes('@') ||
      !validMultilineText(personalMessage.peek(), 500)
    )
      return undefined;
    return {
      email: email.peek(),
      ...(givenName.peek() ? { givenName: givenName.peek() } : {}),
      ...(familyName.peek() ? { familyName: familyName.peek() } : {}),
      ...(locale.peek() ? { locale: locale.peek() } : {}),
      ...(personalMessage.peek() ? { personalMessage: personalMessage.peek() } : {}),
      ...(selectedRoles.length > 0
        ? {
            roles: selectedRoles.map((role) => ({
              applicationId: role.applicationId,
              roleId: role.roleId,
            })),
          }
        : {}),
    };
  };
  /** Builds the email-preview projection; role validation belongs to the invitation mutation. */
  const previewInput = (): AdminInviteUserInput | undefined => {
    const input = collect();
    if (!input) return undefined;
    const preview = { ...input };
    delete preview.roles;
    return preview;
  };
  const openRoles = async (): Promise<void> => {
    if (!roleSource || previewBusy()) return;
    const result = await showInviteRoleDialog(host, operationSignal, roleSource, selectedRoles);
    if (!parentOpen || operationSignal.aborted || result.kind !== 'done') return;
    selectedRoles = result.roles;
    rolesSummary.set(selectedRoles.length === 0 ? 'None' : `${selectedRoles.length} selected`);
  };
  const previewButton = new Button('~P~review', {
    disabled: () => previewBusy(),
    onClick: () => {
      const input = previewInput();
      if (!input || previewBusy()) {
        message.set('Validation failed');
        return;
      }
      previewBusy.set(true);
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
        if (parentOpen && generation === previewGeneration) previewBusy.set(false);
        });
    },
  });
  const inviteButton = new Button('~I~nvite', {
    command: Commands.ok,
    default: true,
    disabled: () => previewBusy(),
  });
  const cancelButton = new Button('Cancel', { command: Commands.cancel });
  const selectRolesButton = roleSource
    ? new Button('~S~elect…', {
        disabled: () => previewBusy(),
        onClick: () => void openRoles(),
      })
    : undefined;
  dialog.add(
    cover(
      col(
        { padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(
          col(
            { gap: 1 },
            inputRow('Email', inputs[0]!),
            inputRow('Given name', inputs[1]!),
            inputRow('Family name', inputs[2]!),
            inputRow('Locale', inputs[3]!),
          ),
          7,
        ),
        ...(selectRolesButton
          ? [
              fixed(
                row(
                  { gap: 1 },
                  fixed(new Text('Roles'), 18),
                  grow(new Text(rolesSummary)),
                  selectRolesButton,
                ),
                1,
              ),
            ]
          : []),
        spacer({ fixed: 1 }),
        fixed(
          row(
            { gap: 1 },
            fixed(new Label('Personal message', personalMessageMemo), 18),
            grow(personalMessageMemo),
          ),
          4,
        ),
        fixed(new Text(message), 1),
        spacer(),
        fixed(row({ gap: 1, justify: 'end' }, previewButton, inviteButton, cancelButton), 2),
      ),
    ),
  );

  try {
    while (true) {
      const command = await runDialog(host, dialog, operationSignal);
      if (command !== Commands.ok) return { kind: 'cancel' };
      if (previewBusy()) continue;
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
  const verified = signal([detail.phoneNumberVerified]);
  const verification = new CheckGroup({ labels: ['Phone number ~v~erified'], value: verified });
  const basic = new Group();
  basic.add(
    cover(
      col(
        { gap: 1, padding: 1 },
        fixed(new Text(`Email: ${detail.email} (read only)`), 1),
        inputRow('Given name', givenNameInput),
        inputRow('Family name', familyNameInput),
        fixed(verification, 1),
      ),
    ),
  );
  const tabs = signal<Tab[]>([
    { title: '~B~asic', content: basic },
    ...profileTabs(values),
  ]);
  const dialog = new Dialog({ title: 'Edit user', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        grow(new TabView({ tabs, active: signal(0) })),
        actionRow(
          new Button('~S~ave', { command: Commands.ok, default: true }),
          new Button('Cancel', { command: Commands.cancel }),
        ),
      ),
    ),
  );
  const inputs = [givenNameInput, familyNameInput];
  for (const tab of tabs.peek().slice(1)) inputs.push(...descendantInputs(tab.content));

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
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text(`User: ${email}`), 1),
        inputRow('Password', passwordInput),
        inputRow('Confirm password', confirmationInput),
        spacer(),
        actionRow(
          new Button('~S~et password', { command: Commands.ok, default: true }),
          new Button('Cancel', { command: Commands.cancel }),
        ),
      ),
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
    deactivate: 'Deactivate',
    activate: 'Activate',
  };
  const { width, height } = dialogSize(host, 58, 11);
  const label = labels[action];
  const targetState =
    action === 'deactivate' ? 'inactive' : action === 'activate' ? 'active' : undefined;
  const dialog = new Dialog({ title: label, width, height, centered: true });
  dialog.add(
    cover(
      col(
        { padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(
          new Text(`${label} for ${email}?${targetState ? `\nTarget state: ${targetState}` : ''}`),
          2,
        ),
        spacer(),
        actionRow(
          new Button(label, { command: Commands.ok, default: true }),
          new Button('Cancel', { command: Commands.cancel }),
        ),
      ),
    ),
  );
  return (await runDialog(host, dialog, operationSignal)) === Commands.ok
    ? { kind: action }
    : { kind: 'cancel' };
}

/** Shows the irreversible physical user-deletion warning with Keep initially focused. */
export async function showDeleteUserDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  organization: AdminOrganizationContext | undefined,
  user: AdminUserDetail,
): Promise<DeleteUserDialogResult> {
  if (!organization || user.organizationId !== organization.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 64, 12);
  const keep = new Button('Keep', { command: Commands.cancel, default: true });
  const remove = new Button(deleteActionLabel(user.email, width), { command: Commands.yes });
  const dialog = new Dialog({ title: 'Delete user', width, height, centered: true });
  const confirmation = deleteConfirmationLayout({
    dialogWidth: width,
    details: `Organization: ${organization.name}\nUser: ${user.email}`,
    warning:
      'This physically deletes identity and security data. Audit records are retained separately.',
    keep,
    remove,
  });
  dialog.add(cover(confirmation.content));
  const outcome = runDialog(host, dialog, operationSignal);
  host.loop.focusView(keep);
  return (await outcome) === Commands.yes ? { kind: 'delete' } : { kind: 'cancel' };
}
