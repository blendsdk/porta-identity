/** Movable Layout DSL dialogs for deployment-global application administration. */

import type {
  CreateApplicationInput,
  CreateModuleInput,
  UpdateApplicationInput,
  UpdateModuleInput,
} from '@portaidentity/sdk';
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
  Memo,
  row,
  signal,
  spacer,
  Text,
} from '@jsvision/ui';
import type { EventLoop, ModalDialogHost, Signal, Validator } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminApplication, AdminApplicationModule } from './application-state.js';
import { textValidator } from './user-dialog-fields.js';

/** Concise scope warning repeated anywhere a global mutation can be confirmed. */
const GLOBAL_SCOPE_NOTICE = 'Deployment-global: changes may affect multiple organizations.';

/** Modal host needed for abort-driven application dialog closure. */
export interface AdminApplicationDialogHost extends ModalDialogHost {
  /** Event loop that can synchronously close the currently owned modal. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Result of the global application create dialog. */
export type CreateApplicationDialogResult =
  | { readonly kind: 'create'; readonly input: CreateApplicationInput }
  | { readonly kind: 'cancel' };

/** Result of the global application edit dialog. */
export type EditApplicationDialogResult =
  | {
      readonly kind: 'update';
      readonly applicationId: string;
      readonly etag?: string;
      readonly input: UpdateApplicationInput;
    }
  | { readonly kind: 'cancel' };

/** Application lifecycle choices that require an explicit warning. */
export type ApplicationLifecycleAction = 'deactivate' | 'archive';

/** Result of an application lifecycle confirmation. */
export type ApplicationLifecycleDialogResult =
  | {
      readonly kind: ApplicationLifecycleAction;
      readonly applicationId: string;
    }
  | { readonly kind: 'cancel' };

/** Result of the module create dialog. */
export type CreateModuleDialogResult =
  | {
      readonly kind: 'create-module';
      readonly applicationId: string;
      readonly input: CreateModuleInput;
    }
  | { readonly kind: 'cancel' };

/** Result of the module edit dialog. */
export type EditModuleDialogResult =
  | {
      readonly kind: 'update-module';
      readonly applicationId: string;
      readonly moduleId: string;
      readonly input: UpdateModuleInput;
    }
  | { readonly kind: 'cancel' };

/** Result of the module deactivation confirmation. */
export type ModuleDeactivationDialogResult =
  | {
      readonly kind: 'deactivate-module';
      readonly applicationId: string;
      readonly moduleId: string;
    }
  | { readonly kind: 'cancel' };

/** Signals and controls shared by the small application and module forms. */
interface EntityForm {
  /** Mutable display name. */
  readonly name: Signal<string>;
  /** Optional create-only slug. */
  readonly slug?: Signal<string>;
  /** Optional or nullable description. */
  readonly description: Signal<string>;
  /** Name input used by the dialog validity sweep. */
  readonly nameInput: Input;
  /** Create-only slug input used by the dialog validity sweep. */
  readonly slugInput?: Input;
  /** Multiline bounded description editor. */
  readonly descriptionMemo: Memo;
}

/** Dialog that includes its multiline description in the modal validity gate. */
class EntityDialog extends Dialog {
  /** Creates one ordinary movable dialog with a bounded description owner. */
  constructor(
    title: string,
    width: number,
    height: number,
    private readonly description: Signal<string>,
    private readonly descriptionMemo: Memo,
  ) {
    super({ title, width, height, centered: true });
  }

  /** Rejects oversized or control-bearing descriptions before the modal can close. */
  valid(command: string): boolean {
    if (command !== Commands.cancel && !validText(this.description.peek(), 0, 2_000, true)) {
      this.firstInvalid = this.descriptionMemo;
      return false;
    }
    return super.valid(command);
  }
}

/** Returns true when a bounded value contains no terminal controls. */
function validText(value: string, minimum: number, maximum: number, optional = false): boolean {
  if (value.length === 0) return optional || minimum === 0;
  if (value.length < minimum || value.length > maximum) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return false;
  }
  return true;
}

/** Creates the server-compatible create-only slug validator. */
function slugValidator(): Validator {
  const syntax = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
  return {
    isValidInput: (value) =>
      value.length <= 100 && ![...value].some((character) => character.codePointAt(0)! <= 0x1f),
    isValid: (value) =>
      value.length === 0 || (value.length >= 3 && value.length <= 100 && syntax.test(value)),
  };
}

/** Returns a dialog size capped to the current terminal surface. */
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

/** Creates one labeled single-line row that cannot stretch vertically. */
function inputRow(label: string, input: Input): ReturnType<typeof row> {
  return fixed(row({ gap: 1 }, fixed(new Label(label, input), 14), grow(input)), 1);
}

/** Creates form signals and controls for create or edit. */
function entityForm(current?: AdminApplication | AdminApplicationModule, includeSlug = false): EntityForm {
  const name = signal(current?.name ?? '');
  const slug = includeSlug ? signal('') : undefined;
  const description = signal(current?.description ?? '');
  const nameInput = new Input({
    value: name,
    maxLength: 255,
    validator: textValidator(1, 255, false),
  });
  const slugInput = slug
    ? new Input({ value: slug, maxLength: 100, validator: slugValidator() })
    : undefined;
  const descriptionMemo = new Memo({ value: description });
  return { name, ...(slug ? { slug } : {}), description, nameInput, ...(slugInput ? { slugInput } : {}), descriptionMemo };
}

/** Builds the complete Layout DSL content for one entity form. */
function formLayout(
  form: EntityForm,
  readOnlySlug: string | undefined,
  submitLabel: string,
): ReturnType<typeof col> {
  return col(
    { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
    fixed(new Text(GLOBAL_SCOPE_NOTICE), 1),
    inputRow('Name', form.nameInput),
    form.slugInput && inputRow('Slug', form.slugInput),
    readOnlySlug ? fixed(new Text(`Slug: ${readOnlySlug} (read only)`), 1) : undefined,
    fixed(new Text('Description'), 1),
    grow(form.descriptionMemo),
    fixed(
      row(
        { gap: 1 },
        spacer(),
        fixed(new Button(submitLabel, { command: Commands.ok, default: true }), 12),
        fixed(new Button('Cancel', { command: Commands.cancel }), 10),
      ),
      2,
    ),
  );
}

/** Shows the application create form with optional slug and description. */
export async function showCreateApplicationDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
): Promise<CreateApplicationDialogResult> {
  const { width, height } = dialogSize(host, 68, 16);
  const form = entityForm(undefined, true);
  const dialog = new EntityDialog(
    'Create application',
    width,
    height,
    form.description,
    form.descriptionMemo,
  );
  dialog.add(cover(formLayout(form, undefined, '~C~reate')));
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: CreateApplicationInput = { name: form.name.peek() };
  if (form.slug?.peek()) input.slug = form.slug.peek();
  if (form.description.peek()) input.description = form.description.peek();
  return { kind: 'create', input };
}

/** Shows the application editor while keeping its stable slug read-only. */
export async function showEditApplicationDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  etag?: string,
): Promise<EditApplicationDialogResult> {
  const { width, height } = dialogSize(host, 68, 16);
  const form = entityForm(application);
  const dialog = new EntityDialog(
    'Edit application',
    width,
    height,
    form.description,
    form.descriptionMemo,
  );
  dialog.add(cover(formLayout(form, application.slug, '~S~ave')));
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: UpdateApplicationInput = {};
  if (form.name.peek() !== application.name) input.name = form.name.peek();
  if (form.description.peek() !== (application.description ?? '')) {
    input.description = form.description.peek() || null;
  }
  return {
    kind: 'update',
    applicationId: application.id,
    ...(etag ? { etag } : {}),
    input,
  };
}

/** Shows the exact application lifecycle effect before dispatch. */
export async function showApplicationLifecycleDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  action: ApplicationLifecycleAction,
  application: AdminApplication,
): Promise<ApplicationLifecycleDialogResult> {
  const { width, height } = dialogSize(host, 68, 12);
  const title = action === 'archive' ? 'Archive application' : 'Deactivate application';
  const dialog = new Dialog({ title, width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text(GLOBAL_SCOPE_NOTICE), 1),
        grow(
          new Text(
            `${title}: ${application.name}?\nNew client creation stops.\nExisting clients remain enabled.`,
          ),
        ),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            fixed(new Button(title, { command: Commands.ok, default: true }), 22),
            fixed(new Button('Cancel', { command: Commands.cancel }), 10),
          ),
          2,
        ),
      ),
    ),
  );
  return (await runDialog(host, dialog, operationSignal)) === Commands.ok
    ? { kind: action, applicationId: application.id }
    : { kind: 'cancel' };
}

/** Shows the module create form under its explicit internal parent UUID. */
export async function showCreateModuleDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  applicationId: string,
): Promise<CreateModuleDialogResult> {
  const { width, height } = dialogSize(host, 68, 16);
  const form = entityForm(undefined, true);
  const dialog = new EntityDialog(
    'Add module',
    width,
    height,
    form.description,
    form.descriptionMemo,
  );
  dialog.add(cover(formLayout(form, undefined, '~A~dd')));
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: CreateModuleInput = { name: form.name.peek() };
  if (form.slug?.peek()) input.slug = form.slug.peek();
  if (form.description.peek()) input.description = form.description.peek();
  return { kind: 'create-module', applicationId, input };
}

/** Shows the module editor with its stable slug and parent kept read-only. */
export async function showEditModuleDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  module: AdminApplicationModule,
): Promise<EditModuleDialogResult> {
  const { width, height } = dialogSize(host, 68, 16);
  const form = entityForm(module);
  const dialog = new EntityDialog(
    'Edit module',
    width,
    height,
    form.description,
    form.descriptionMemo,
  );
  dialog.add(cover(formLayout(form, module.slug, '~S~ave')));
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  const input: UpdateModuleInput = {};
  if (form.name.peek() !== module.name) input.name = form.name.peek();
  if (form.description.peek() !== (module.description ?? '')) {
    input.description = form.description.peek() || null;
  }
  return {
    kind: 'update-module',
    applicationId: module.applicationId,
    moduleId: module.id,
    input,
  };
}

/** Shows the exact module deactivation target before dispatch. */
export async function showModuleDeactivationDialog(
  host: AdminApplicationDialogHost,
  operationSignal: AbortSignal,
  application: AdminApplication,
  module: AdminApplicationModule,
): Promise<ModuleDeactivationDialogResult> {
  if (module.applicationId !== application.id) return { kind: 'cancel' };
  const { width, height } = dialogSize(host, 68, 11);
  const dialog = new Dialog({ title: 'Deactivate module', width, height, centered: true });
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(new Text(GLOBAL_SCOPE_NOTICE), 1),
        grow(new Text(`Application: ${application.name}\nModule: ${module.name}`)),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            fixed(
              new Button('Deactivate', { command: Commands.ok, default: true }),
              14,
            ),
            fixed(new Button('Cancel', { command: Commands.cancel }), 10),
          ),
          2,
        ),
      ),
    ),
  );
  return (await runDialog(host, dialog, operationSignal)) === Commands.ok
    ? {
        kind: 'deactivate-module',
        applicationId: application.id,
        moduleId: module.id,
      }
    : { kind: 'cancel' };
}
