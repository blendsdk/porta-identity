/** Focused dialogs for Application-owned roles, permissions, and direct mappings. */

import type {
  CreatePermissionInput,
  CreateRoleInput,
  UpdatePermissionInput,
  UpdateRoleInput,
} from '@portaidentity/sdk';
import {
  Button,
  col,
  ComboBox,
  Commands,
  cover,
  DataGrid,
  Dialog,
  fixed,
  grow,
  Input,
  Label,
  Memo,
  row,
  signal,
  sortRows,
  spacer,
  Text,
} from '@jsvision/ui';
import type { Column, Signal, SortState, Validator, View } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminApplication, AdminApplicationModule } from './application-state.js';
import type { AdminApplicationDialogHost } from './application-dialogs.js';
import { deleteActionLabel, deleteConfirmationLayout } from './delete-confirmation-layout.js';
import { isAdminPermissionSlug } from './rbac-state.js';
import type { AdminPermission, AdminRole } from './rbac-state.js';
import { textValidator } from './user-dialog-fields.js';

const ENTITY_DIALOG_HEIGHT = 20;

/** Result returned by the role creation dialog. */
export type CreateRoleDialogResult =
  { readonly kind: 'create-role'; readonly input: CreateRoleInput } | { readonly kind: 'cancel' };

/** Result returned by the role editor. */
export type EditRoleDialogResult =
  | { readonly kind: 'update-role'; readonly roleId: string; readonly input: UpdateRoleInput }
  | { readonly kind: 'cancel' };

/** Result returned by permanent role deletion confirmation. */
export type DeleteRoleDialogResult =
  { readonly kind: 'delete-role'; readonly roleId: string } | { readonly kind: 'cancel' };

/** Result returned by the permission creation dialog. */
export type CreatePermissionDialogResult =
  | { readonly kind: 'create-permission'; readonly input: CreatePermissionInput }
  | { readonly kind: 'cancel' };

/** Result returned by the permission editor. */
export type EditPermissionDialogResult =
  | {
      readonly kind: 'update-permission';
      readonly permissionId: string;
      readonly input: UpdatePermissionInput;
    }
  | { readonly kind: 'cancel' };

/** Result returned by permanent permission deletion confirmation. */
export type DeletePermissionDialogResult =
  | { readonly kind: 'delete-permission'; readonly permissionId: string }
  | { readonly kind: 'cancel' };

/** One direct permission mapping choice. */
export type ManageRolePermissionsDialogResult =
  | { readonly kind: 'assign-permission'; readonly roleId: string; readonly permissionId: string }
  | { readonly kind: 'remove-permission'; readonly roleId: string; readonly permissionId: string }
  | { readonly kind: 'cancel' };

/** Signals and controls shared by role and permission entity dialogs. */
interface RbacEntityForm {
  /** Mutable display name. */
  readonly name: Signal<string>;
  /** Stable create identity, or mutable role identity. */
  readonly slug?: Signal<string>;
  /** Optional multiline explanation. */
  readonly description: Signal<string>;
  /** Name input used by the validity sweep. */
  readonly nameInput: Input;
  /** Optional slug input used by the validity sweep. */
  readonly slugInput?: Input;
  /** Multiline description editor. */
  readonly descriptionMemo: Memo;
}

/** Dialog that includes a multiline memo in its modal validity gate. */
class RbacEntityDialog extends Dialog {
  /** Creates one ordinary focused entity dialog. */
  constructor(
    title: string,
    width: number,
    height: number,
    private readonly description: Signal<string>,
    private readonly descriptionMemo: Memo,
  ) {
    super({ title, width, height, centered: true });
  }

  /** Rejects unsafe or oversized description text for every submit path. */
  valid(command: string): boolean {
    if (command !== Commands.cancel && !validDescription(this.description.peek())) {
      this.firstInvalid = this.descriptionMemo;
      return false;
    }
    return super.valid(command);
  }
}

/** Returns a preferred dialog size capped to the current terminal. */
function dialogSize(
  host: AdminApplicationDialogHost,
  preferredWidth: number,
  preferredHeight: number,
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, Math.min(preferredWidth, host.desktop.bounds.width)),
    height: Math.max(1, Math.min(preferredHeight, host.desktop.bounds.height)),
  };
}

/** Runs one abortable modal and always removes its window from the desktop. */
async function runDialog(
  host: AdminApplicationDialogHost,
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

/** Accepts bounded multiline text while rejecting terminal control characters. */
function validDescription(value: string): boolean {
  if (value.length > 1_000) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x0a || codePoint === 0x0d) return false;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Creates the server-compatible role slug validator. */
function roleSlugValidator(): Validator {
  const syntax = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
  return {
    isValidInput: (value) => value.length <= 100,
    isValid: (value) => value.length === 0 || (value.length <= 100 && syntax.test(value)),
  };
}

/** Creates the server-compatible permission slug validator. */
function permissionSlugValidator(): Validator {
  return {
    isValidInput: (value) => value.length <= 150,
    isValid: isAdminPermissionSlug,
  };
}

/** Creates one fixed-height labeled input row. */
function inputRow(label: string, input: Input): ReturnType<typeof row> {
  return fixed(row({ gap: 1 }, fixed(new Label(label, input), 14), grow(input)), 1);
}

/** Creates the editable fields shared by role and permission forms. */
function entityForm(options: {
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string | null;
  readonly slugKind?: 'role' | 'permission';
}): RbacEntityForm {
  const name = signal(options.name ?? '');
  const slug = options.slugKind ? signal(options.slug ?? '') : undefined;
  const description = signal(options.description ?? '');
  const slugValidator =
    options.slugKind === 'permission' ? permissionSlugValidator() : roleSlugValidator();
  const slugInput = slug
    ? new Input({
        value: slug,
        maxLength: options.slugKind === 'permission' ? 150 : 100,
        validator: slugValidator,
      })
    : undefined;
  return {
    name,
    ...(slug ? { slug } : {}),
    description,
    nameInput: new Input({ value: name, maxLength: 255, validator: textValidator(1, 255, false) }),
    ...(slugInput ? { slugInput } : {}),
    descriptionMemo: new Memo({ value: description }),
  };
}

/** Builds one direct entity form without nested surfaces or scrolling. */
function entityLayout(
  form: RbacEntityForm,
  readOnlyLines: readonly string[],
  submitLabel: string,
  canSubmit: () => boolean,
  additionalRows: readonly View[] = [],
  compact = false,
): ReturnType<typeof col> {
  return col(
    { gap: compact ? 0 : 1, padding: 1 },
    inputRow('Name', form.nameInput),
    form.slugInput && inputRow('Slug', form.slugInput),
    ...additionalRows,
    ...readOnlyLines.map((line) => fixed(new Text(line), 1)),
    fixed(new Text('Description'), 1),
    grow(form.descriptionMemo, 1, { min: compact ? 1 : 4 }),
    fixed(
      row(
        { gap: 1 },
        spacer(),
        new Button(submitLabel, {
          command: Commands.ok,
          default: true,
          disabled: () => !canSubmit(),
        }),
        new Button('Cancel', { command: Commands.cancel }),
      ),
      2,
    ),
  );
}

/** Returns whether the common entity values satisfy their local field contracts. */
function entityIsValid(
  form: RbacEntityForm,
  slugKind: 'optional-role' | 'required-role' | 'permission' | 'none',
): boolean {
  const nameValid = textValidator(1, 255, false).isValid(form.name());
  const slug = form.slug?.() ?? '';
  const slugValid =
    slugKind === 'none' ||
    (slugKind === 'optional-role'
      ? roleSlugValidator().isValid(slug)
      : slugKind === 'required-role'
        ? slug.length > 0 && roleSlugValidator().isValid(slug)
        : permissionSlugValidator().isValid(slug));
  return nameValid && slugValid && validDescription(form.description());
}

/** Opens the focused role creation form. */
export async function showCreateRoleDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
): Promise<CreateRoleDialogResult> {
  const { width, height } = dialogSize(host, 68, ENTITY_DIALOG_HEIGHT);
  const form = entityForm({ slugKind: 'role' });
  const dialog = new RbacEntityDialog(
    'Add role',
    width,
    height,
    form.description,
    form.descriptionMemo,
  );
  dialog.add(
    cover(
      entityLayout(
        form,
        [`Application: ${application.name}`],
        '~C~reate',
        () => entityIsValid(form, 'optional-role'),
        [],
        height < ENTITY_DIALOG_HEIGHT,
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: CreateRoleInput = { name: form.name.peek() };
  if (form.slug?.peek()) input.slug = form.slug.peek();
  if (form.description.peek()) input.description = form.description.peek();
  return { kind: 'create-role', input };
}

/** Opens the role editor with all mutable role metadata. */
export async function showEditRoleDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  role: AdminRole,
): Promise<EditRoleDialogResult> {
  if (role.applicationId !== application.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 68, ENTITY_DIALOG_HEIGHT);
  const form = entityForm({ ...role, slugKind: 'role' });
  const dialog = new RbacEntityDialog(
    'Edit role',
    width,
    height,
    form.description,
    form.descriptionMemo,
  );
  dialog.add(
    cover(
      entityLayout(
        form,
        [`Application: ${application.name}`],
        '~S~ave',
        () => entityIsValid(form, 'required-role'),
        [],
        height < ENTITY_DIALOG_HEIGHT,
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: UpdateRoleInput = {};
  if (form.name.peek() !== role.name) input.name = form.name.peek();
  if (form.slug?.peek() !== role.slug) input.slug = form.slug?.peek();
  if (form.description.peek() !== (role.description ?? ''))
    input.description = form.description.peek() || null;
  return { kind: 'update-role', roleId: role.id, input };
}

/** Shows the permanent role cascade before dispatch. */
export async function showDeleteRoleDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  role: AdminRole,
): Promise<DeleteRoleDialogResult> {
  if (role.applicationId !== application.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 72, 13);
  const keep = new Button('Keep', { command: Commands.cancel, default: true });
  const remove = new Button(deleteActionLabel(role.name, width), { command: Commands.yes });
  const dialog = new Dialog({ title: 'Delete role', width, height, centered: true });
  const confirmation = deleteConfirmationLayout({
    dialogWidth: width,
    details: `Application: ${application.name}\nRole: ${role.name}`,
    warning: 'Deleting this role also deletes its permission and user assignments.',
    keep,
    remove,
  });
  dialog.add(cover(confirmation.content));
  const outcome = runDialog(host, dialog, operationSignal);
  host.loop.focusView(keep);
  return (await outcome) === Commands.yes
    ? { kind: 'delete-role', roleId: role.id }
    : { kind: 'cancel' };
}

/** Scope selector value that keeps the Application option distinct from module UUIDs. */
interface PermissionScopeChoice {
  /** Label shown in the selector. */
  readonly label: string;
  /** Module UUID, or null for Application scope. */
  readonly moduleId: string | null;
}

/** Creates valid scope choices owned by the selected Application. */
function permissionScopeChoices(
  application: AdminApplication,
  modules: readonly AdminApplicationModule[],
): PermissionScopeChoice[] {
  return [
    { label: 'Application', moduleId: null },
    ...modules
      .filter((module) => module.applicationId === application.id)
      .map((module) => ({ label: module.name, moduleId: module.id })),
  ];
}

/** Opens the focused permission creation form. */
export async function showCreatePermissionDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  modules: readonly AdminApplicationModule[],
): Promise<CreatePermissionDialogResult> {
  const { width, height } = dialogSize(host, 68, ENTITY_DIALOG_HEIGHT);
  const form = entityForm({ slugKind: 'permission' });
  const choices = permissionScopeChoices(application, modules);
  const scope = signal<PermissionScopeChoice | null>(choices[0] ?? null);
  const selector = new ComboBox<PermissionScopeChoice>({
    items: signal(choices),
    getText: (choice) => choice.label,
    value: scope,
    editable: false,
  });
  const dialog = new RbacEntityDialog(
    'Add permission',
    width,
    height,
    form.description,
    form.descriptionMemo,
  );
  const content = entityLayout(
    form,
    [`Application: ${application.name}`],
    '~C~reate',
    () => entityIsValid(form, 'permission'),
    [fixed(row({ gap: 1 }, fixed(new Label('Scope', selector), 14), grow(selector)), 1)],
    height < ENTITY_DIALOG_HEIGHT,
  );
  dialog.add(cover(content));
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: CreatePermissionInput = { name: form.name.peek(), slug: form.slug?.peek() ?? '' };
  if (form.description.peek()) input.description = form.description.peek();
  const moduleId = scope.peek()?.moduleId;
  if (moduleId) input.moduleId = moduleId;
  return { kind: 'create-permission', input };
}

/** Opens the permission editor while keeping identity and scope read-only. */
export async function showEditPermissionDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  permission: AdminPermission,
  modules: readonly AdminApplicationModule[],
): Promise<EditPermissionDialogResult> {
  if (permission.applicationId !== application.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 68, ENTITY_DIALOG_HEIGHT);
  const form = entityForm(permission);
  const scope = permission.moduleId
    ? (modules.find((module) => module.id === permission.moduleId)?.name ?? permission.moduleId)
    : 'Application';
  const dialog = new RbacEntityDialog(
    'Edit permission',
    width,
    height,
    form.description,
    form.descriptionMemo,
  );
  dialog.add(
    cover(
      entityLayout(
        form,
        [
          `Application: ${application.name}`,
          `Slug: ${permission.slug} (read only)`,
          `Scope: ${scope} (read only)`,
        ],
        '~S~ave',
        () => entityIsValid(form, 'none'),
        [],
        height < ENTITY_DIALOG_HEIGHT,
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: UpdatePermissionInput = {
    ...(form.name.peek() !== permission.name ? { name: form.name.peek() } : {}),
    description: form.description.peek() || null,
  };
  return { kind: 'update-permission', permissionId: permission.id, input };
}

/** Shows the permanent permission cascade before dispatch. */
export async function showDeletePermissionDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  permission: AdminPermission,
): Promise<DeletePermissionDialogResult> {
  if (permission.applicationId !== application.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 72, 13);
  const keep = new Button('Keep', { command: Commands.cancel, default: true });
  const remove = new Button(deleteActionLabel(permission.name, width), { command: Commands.yes });
  const dialog = new Dialog({ title: 'Delete permission', width, height, centered: true });
  const confirmation = deleteConfirmationLayout({
    dialogWidth: width,
    details: `Application: ${application.name}\nPermission: ${permission.name}`,
    warning: 'Deleting this permission also deletes its role assignments.',
    keep,
    remove,
  });
  dialog.add(cover(confirmation.content));
  const outcome = runDialog(host, dialog, operationSignal);
  host.loop.focusView(keep);
  return (await outcome) === Commands.yes
    ? { kind: 'delete-permission', permissionId: permission.id }
    : { kind: 'cancel' };
}

const MAPPING_COLUMNS: Column<AdminPermission>[] = [
  { title: 'Name', accessor: (permission) => permission.name, width: '1fr', minWidth: 16 },
  { title: 'Slug', accessor: (permission) => permission.slug, width: '1fr', minWidth: 20 },
];

/** Opens the available-permission chooser after the administrator selects Add. */
async function showAvailablePermissionDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  role: AdminRole,
  available: readonly AdminPermission[],
): Promise<ManageRolePermissionsDialogResult> {
  const { width, height } = dialogSize(host, 68, 11);
  const selected = signal<AdminPermission | null>(null);
  const selector = new ComboBox<AdminPermission>({
    items: signal([...available]),
    getText: (permission) => `${permission.name} — ${permission.slug}`,
    value: selected,
    editable: false,
  });
  const dialog = new Dialog({ title: 'Add role permission', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: 1 },
        fixed(new Text(`Role: ${role.name}`), 1),
        fixed(row({ gap: 1 }, fixed(new Label('Permission', selector), 14), grow(selector)), 1),
        grow(
          new Text(
            available.length === 0 ? 'No permissions are available.' : 'Select one permission.',
          ),
        ),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            new Button('Add', {
              command: Commands.ok,
              default: true,
              disabled: () => selected() === null,
            }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const permission = selected.peek();
  return permission
    ? { kind: 'assign-permission', roleId: role.id, permissionId: permission.id }
    : { kind: 'cancel' };
}

/** Opens assigned permissions and returns exactly one direct add or remove intent. */
export async function showManageRolePermissionsDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  role: AdminRole,
  assigned: readonly AdminPermission[],
  available: readonly AdminPermission[],
  canAdd: boolean,
): Promise<ManageRolePermissionsDialogResult> {
  if (
    role.applicationId !== application.id ||
    [...assigned, ...available].some((permission) => permission.applicationId !== application.id)
  ) {
    return { kind: 'cancel' };
  }
  const { width, height } = dialogSize(host, 72, 18);
  const rows = signal([...assigned]);
  const selected = signal(-1);
  const sort = signal<SortState>(null);
  const selectedPermission = (): AdminPermission | undefined =>
    sortRows(rows(), MAPPING_COLUMNS, sort())[selected()];
  const dialog = new Dialog({ title: 'Manage role permissions', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: 1 },
        fixed(new Text(`Application: ${application.name}\nRole: ${role.name}`), 2),
        grow(
          new DataGrid<AdminPermission>({
            rows,
            columns: MAPPING_COLUMNS,
            selected,
            sort,
            zebra: true,
          }),
        ),
        fixed(
          row(
            { gap: 1 },
            new Button('Add', { command: 'add-permission', disabled: !canAdd }),
            new Button('Remove', {
              command: 'remove-permission',
              disabled: () => !selectedPermission(),
            }),
            spacer(),
            new Button('Close', { command: Commands.cancel, default: true }),
          ),
          2,
        ),
      ),
    ),
  );
  const outcome = await runDialog(host, dialog, operationSignal);
  if (outcome === 'add-permission') {
    return showAvailablePermissionDialog(host, operationSignal, role, available);
  }
  const permission = selectedPermission();
  return outcome === 'remove-permission' && permission
    ? { kind: 'remove-permission', roleId: role.id, permissionId: permission.id }
    : { kind: 'cancel' };
}
