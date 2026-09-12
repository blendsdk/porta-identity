/** Focused dialogs for Application-owned roles, permissions, and direct mappings. */

import type {
  CreatePermissionInput,
  CreateRoleInput,
  UpdatePermissionInput,
  UpdateRoleInput,
} from '@portaidentity/sdk';
import {
  Button,
  CheckGroup,
  col,
  ComboBox,
  Commands,
  cover,
  Dialog,
  fixed,
  grow,
  Input,
  Label,
  Memo,
  row,
  signal,
  spacer,
  Text,
} from '@jsvision/ui';
import type { Signal, Validator, View } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminApplication, AdminApplicationModule } from './application-state.js';
import type { AdminApplicationDialogHost } from './application-dialogs.js';
import { isCanonicalPermission } from './application-rbac-workspace.js';
import { deleteActionLabel, deleteConfirmationLayout } from './delete-confirmation-layout.js';
import { isAdminPermissionSlug } from './rbac-state.js';
import type { AdminPermission, AdminRole } from './rbac-state.js';
import { SelectableReadOnlyInput } from './selectable-read-only-input.js';
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

/** Saved checkbox differences for one role, or cancellation. */
export type ManageRolePermissionsDialogResult =
  | {
      readonly kind: 'update-role-permissions';
      readonly roleId: string;
      readonly assignPermissionIds: readonly string[];
      readonly removePermissionIds: readonly string[];
    }
  | { readonly kind: 'cancel' };

/** Signals and controls shared by role and permission entity dialogs. */
interface RbacEntityForm {
  /** Mutable display name. */
  readonly name: Signal<string>;
  /** Stable create identity, or mutable role identity. */
  readonly slug?: Signal<string>;
  /** Whether the slug must contain a valid value before submission. */
  readonly slugRequired: boolean;
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
  return {
    isValidInput: (value) => value.length <= 100,
    isValid: (value) => {
      const normalized = value.trim();
      return normalized.length === 0 || isSafeClaimValue(normalized, 100);
    },
  };
}

/** Creates the server-compatible permission slug validator. */
function permissionSlugValidator(): Validator {
  return {
    isValidInput: (value) => value.length <= 150,
    isValid: (value) => isAdminPermissionSlug(value.trim()),
  };
}

/** Checks a trimmed claim value using the terminal-safe response validator. */
function isSafeClaimValue(value: string, maximum: number): boolean {
  if (value.length === 0 || value.length > maximum) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
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
  readonly slugRequired?: boolean;
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
        ...(options.slugKind === 'permission' ? { placeholder: 'Exact claim value' } : {}),
        validator: slugValidator,
      })
    : undefined;
  return {
    name,
    ...(slug ? { slug } : {}),
    slugRequired: options.slugRequired ?? false,
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
    inputRow('Name *', form.nameInput),
    form.slugInput && inputRow(form.slugRequired ? 'Slug *' : 'Slug', form.slugInput),
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
        ? slug.trim().length > 0 && roleSlugValidator().isValid(slug)
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
  if (form.slug?.peek().trim()) input.slug = form.slug.peek().trim();
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
  const form = entityForm({ ...role, slugKind: 'role', slugRequired: true });
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
  if (form.slug?.peek().trim() !== role.slug) input.slug = form.slug?.peek().trim();
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

/** Scope selector value that keeps application-level scope distinct from module UUIDs. */
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
    { label: application.name, moduleId: null },
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
  const form = entityForm({ slugKind: 'permission', slugRequired: true });
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
  const input: CreatePermissionInput = {
    name: form.name.peek(),
    slug: form.slug?.peek().trim() ?? '',
  };
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
    : application.name;
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
          `Scope: ${scope} (read only)`,
        ],
        '~S~ave',
        () => entityIsValid(form, 'none'),
        [inputRow('Slug', new SelectableReadOnlyInput(permission.slug))],
        height < ENTITY_DIALOG_HEIGHT,
      ),
    ),
  );
  const outcome = runDialog(host, dialog, operationSignal);
  host.loop.focusView(form.nameInput);
  if ((await outcome) !== Commands.ok) return { kind: 'cancel' };
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

/** Opens assignable permissions in two checkbox columns and returns their saved differences. */
export async function showManageRolePermissionsDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  role: AdminRole,
  assigned: readonly AdminPermission[],
  available: readonly AdminPermission[],
  canManage: boolean,
): Promise<ManageRolePermissionsDialogResult> {
  if (
    role.applicationId !== application.id ||
    [...assigned, ...available].some((permission) => permission.applicationId !== application.id)
  ) {
    return { kind: 'cancel' };
  }
  const assignedIds = new Set(assigned.map((permission) => permission.id));
  const allPermissions = [...assigned, ...available];
  const editablePermissions = allPermissions
    .filter((permission) => !isCanonicalPermission(application, permission))
    .sort((left, right) =>
      left.name === right.name
        ? left.slug.localeCompare(right.slug)
        : left.name.localeCompare(right.name),
    );
  const protectedCount = allPermissions.length - editablePermissions.length;
  const splitAt = Math.ceil(editablePermissions.length / 2);
  const permissionColumns = [
    editablePermissions.slice(0, splitAt),
    editablePermissions.slice(splitAt),
  ] as const;
  const initialValues = permissionColumns.map((permissions) =>
    permissions.map((permission) => assignedIds.has(permission.id)),
  );
  const checkedColumns = [signal([...initialValues[0]]), signal([...initialValues[1]])] as const;
  const checkGroups = permissionColumns.map(
    (permissions, index) =>
      new CheckGroup({
        labels: permissions.map((permission) => `${permission.name} — ${permission.slug}`),
        value: checkedColumns[index]!,
      }),
  );
  const isDirty = (): boolean =>
    checkedColumns.some((values, columnIndex) =>
      values().some((value, rowIndex) => value !== initialValues[columnIndex]?.[rowIndex]),
    );
  const checkboxRows = Math.max(1, permissionColumns[0].length, permissionColumns[1].length);
  const { width, height } = dialogSize(host, 78, Math.max(14, checkboxRows + 10));
  const save = new Button('Save', {
    command: Commands.ok,
    default: true,
    disabled: () => !canManage || !isDirty(),
  });
  const cancel = new Button('Cancel', { command: Commands.cancel });
  const permissionChoices: View =
    editablePermissions.length === 0
      ? new Text('No assignable permissions.')
      : row({ gap: 2 }, grow(checkGroups[0]!), grow(checkGroups[1]!));
  const dialog = new Dialog({ title: 'Manage role permissions', width, height, centered: true });
  dialog.resizable = true;
  dialog.minWidth = Math.min(52, width);
  dialog.minHeight = Math.min(12, height);
  dialog.add(
    cover(
      col(
        { gap: 1, padding: 1 },
        fixed(
          new Text(
            `Application: ${application.name}\nRole: ${role.name}\nChecked permissions are assigned to this role.`,
          ),
          3,
        ),
        ...(protectedCount > 0
          ? [
              fixed(
                new Text(
                  `${protectedCount} protected built-in permission${protectedCount === 1 ? ' is' : 's are'} not editable here.`,
                ),
                1,
              ),
            ]
          : []),
        grow(permissionChoices),
        fixed(row({ gap: 1 }, spacer(), save, cancel), 2),
      ),
    ),
  );
  const outcome = runDialog(host, dialog, operationSignal);
  host.loop.focusView(editablePermissions.length > 0 ? checkGroups[0]! : cancel);
  const command = await outcome;
  if (command !== Commands.ok || !isDirty()) return { kind: 'cancel' };
  const assignPermissionIds: string[] = [];
  const removePermissionIds: string[] = [];
  permissionColumns.forEach((permissions, columnIndex) => {
    permissions.forEach((permission, rowIndex) => {
      const wasAssigned = initialValues[columnIndex]?.[rowIndex] ?? false;
      const isAssigned = checkedColumns[columnIndex]?.peek()[rowIndex] ?? false;
      if (!wasAssigned && isAssigned) assignPermissionIds.push(permission.id);
      if (wasAssigned && !isAssigned) removePermissionIds.push(permission.id);
    });
  });
  return {
    kind: 'update-role-permissions',
    roleId: role.id,
    assignPermissionIds,
    removePermissionIds,
  };
}
