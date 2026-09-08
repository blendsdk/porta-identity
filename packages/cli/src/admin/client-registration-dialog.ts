/** Compact registration dialog for creating one OIDC client from server-backed defaults. */

import type { CreateClientInput } from '@portaidentity/sdk';
import {
  Button,
  col,
  ComboBox,
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
  Show,
  signal,
  spacer,
  Text,
} from '@jsvision/ui';
import type { EventLoop, ModalDialogHost, Signal } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminApplication } from './application-state.js';
import {
  createClientSecretExpiryFields,
  type ClientSecretExpiryFields,
} from './client-credential-dialogs.js';
import { ClientFormScroller } from './client-form-scroller.js';
import type { AdminOrganizationContext } from './state.js';
import { textValidator } from './user-dialog-fields.js';

/** Modal host needed for abort-driven registration dialog closure. */
export interface AdminClientRegistrationDialogHost extends ModalDialogHost {
  /** Event loop that can synchronously close and focus the owned modal. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal' | 'focusView'>;
}

/** Context and active applications available to client registration. */
export interface AdminClientRegistrationDialogOptions {
  /** Organization that will own the new client. */
  readonly organization: AdminOrganizationContext;
  /** Applications visible in the current organization context. */
  readonly applications: readonly AdminApplication[];
}

/** Result returned by compact client registration. */
export type AdminClientRegistrationDialogResult =
  | { readonly kind: 'create'; readonly input: Omit<CreateClientInput, 'organizationId'> }
  | { readonly kind: 'cancel' };

/** Signals and controls owned by one registration dialog. */
interface RegistrationForm {
  /** Administrative client display name. */
  readonly clientName: Signal<string>;
  /** Selected active application. */
  readonly application: Signal<AdminApplication | null>;
  /** Public/confidential selection index. */
  readonly clientType: Signal<number>;
  /** Web/native/SPA selection index. */
  readonly applicationType: Signal<number>;
  /** Initial exact redirect URI. */
  readonly redirectUri: Signal<string>;
  /** Optional initial-secret label. */
  readonly secretLabel: Signal<string>;
  /** Initial-secret expiry selection shared with credential generation. */
  readonly secretExpiry: ClientSecretExpiryFields;
  /** Client-name control used when validation rejects submission. */
  readonly nameInput: Input;
  /** Redirect control used when validation rejects submission. */
  readonly redirectInput: Input;
  /** Optional initial-secret label control. */
  readonly secretLabelInput: Input;
  /** Application picker used when no active application is available. */
  readonly applicationPicker: ComboBox<AdminApplication>;
}

/** Dialog that applies the same validation to buttons, Enter, and programmatic submission. */
class ClientRegistrationDialog extends Dialog {
  /** Creates one fixed registration surface that will fill its desktop. */
  constructor(
    width: number,
    height: number,
    private readonly form: RegistrationForm,
  ) {
    super({ title: 'Register OIDC client', width, height, centered: true });
    this.closable = false;
    this.movable = false;
    this.resizable = false;
    this.zoomable = false;
  }

  /** Prevents an invalid or incomplete form from emitting a create result. */
  valid(command: string): boolean {
    if (command === Commands.cancel) return true;
    if (!registrationIsValid(this.form)) {
      this.firstInvalid = firstInvalidControl(this.form);
      return false;
    }
    return super.valid(command);
  }
}

/** Returns true for bounded text that cannot alter terminal rendering. */
function validText(value: string, minimum: number, maximum: number): boolean {
  if (value.length < minimum || value.length > maximum) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Returns true for one absolute redirect URI without wildcard or fragment syntax. */
function validRedirectUri(value: string): boolean {
  if (!validText(value, 1, 2_048) || value.includes('*')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1 && parsed.hash === '';
  } catch {
    return false;
  }
}

/** Reads current form values and applies the complete visible-field validity rule. */
function registrationIsValid(form: RegistrationForm): boolean {
  return (
    validText(form.clientName(), 1, 255) &&
    form.application() !== null &&
    form.clientType() >= 0 &&
    form.clientType() <= 1 &&
    form.applicationType() >= 0 &&
    form.applicationType() <= 2 &&
    validRedirectUri(form.redirectUri()) &&
    (form.clientType() === 0 ||
      (validText(form.secretLabel(), 0, 255) && form.secretExpiry.isValid()))
  );
}

/** Chooses the most useful control when validation blocks submission. */
function firstInvalidControl(form: RegistrationForm): Input | ComboBox<AdminApplication> {
  if (!validText(form.clientName.peek(), 1, 255)) return form.nameInput;
  if (!form.application.peek()) return form.applicationPicker;
  return form.redirectInput;
}

/** Caps the preferred dialog geometry to the current terminal. */
function registrationDialogSize(host: AdminClientRegistrationDialogHost): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: Math.max(1, Math.min(68, host.desktop.bounds.width)),
    height: Math.max(1, Math.min(20, host.desktop.bounds.height)),
  };
}

/** Maximizes a fixed dialog while keeping restore and resize operations unavailable to the user. */
function maximizeRegistrationDialog(dialog: Dialog): void {
  if (dialog.isZoomed()) return;
  dialog.zoomable = true;
  dialog.zoom();
  dialog.zoomable = false;
}

/** Runs one abortable modal and removes it regardless of its completion path. */
async function runRegistrationDialog(
  host: AdminClientRegistrationDialogHost,
  dialog: Dialog,
  operationSignal: AbortSignal,
): Promise<string> {
  host.desktop.addWindow(dialog);
  maximizeRegistrationDialog(dialog);
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

/** Creates a one-row field whose label points at its input control. */
function registrationInputRow(label: string, input: Input): ReturnType<typeof row> {
  return fixed(row({ gap: 1 }, fixed(new Label(label, input), 18), grow(input)), 1);
}

/** Builds the spacious client identity and type region of the registration form. */
function clientDetailsGroup(
  form: RegistrationForm,
  organization: AdminOrganizationContext,
): GroupBox {
  const details = new GroupBox({ title: 'Client details', padding: 1 });
  details.add(
    cover(
      col(
        { gap: 1 },
        fixed(new Text(`Organization: ${organization.name} (read only)`), 1),
        registrationInputRow('Client name', form.nameInput),
        fixed(row({ gap: 1 }, fixed(new Text('Application'), 18), grow(form.applicationPicker)), 1),
        fixed(
          row(
            { gap: 1 },
            fixed(new Text('Client type'), 18),
            grow(
              new RadioGroup({
                labels: ['~P~ublic', 'Con~f~idential'],
                value: form.clientType,
              }),
            ),
          ),
          2,
        ),
        fixed(
          row(
            { gap: 1 },
            fixed(new Text('Application type'), 18),
            grow(
              new RadioGroup({
                labels: ['~W~eb', '~N~ative', '~S~PA'],
                value: form.applicationType,
              }),
            ),
          ),
          3,
        ),
        registrationInputRow('Redirect URI', form.redirectInput),
      ),
    ),
  );
  return details;
}

/** Builds the optional initial-secret region shown only for confidential clients. */
function initialSecretGroup(form: RegistrationForm): GroupBox {
  const secret = new GroupBox({ title: 'Initial secret', padding: 1 });
  secret.add(
    cover(
      col(
        { gap: 1 },
        registrationInputRow('Secret label', form.secretLabelInput),
        fixed(form.secretExpiry.content, 4),
      ),
    ),
  );
  return secret;
}

/** Creates a vertically scrollable form whose logical regions retain comfortable spacing. */
function registrationFormScroller(
  dialog: Dialog,
  form: RegistrationForm,
  organization: AdminOrganizationContext,
): ClientFormScroller {
  const formContent = col(
    { gap: 1, padding: 1 },
    fixed(clientDetailsGroup(form, organization), 16),
  );
  formContent.addDynamic(() =>
    Show(
      () => form.clientType() === 1,
      () => fixed(initialSecretGroup(form), 8),
    ),
  );
  return new ClientFormScroller(formContent, () => ({
    width: Math.max(1, (dialog.bounds.width || 68) - 6),
    height: form.clientType() === 1 ? 27 : 18,
  }));
}

/** Creates the signals and controls for one compact registration attempt. */
function createRegistrationForm(applications: readonly AdminApplication[]): RegistrationForm {
  const activeApplications = applications.filter((application) => application.status === 'active');
  const clientName = signal('');
  const application = signal<AdminApplication | null>(activeApplications[0] ?? null);
  const clientType = signal(1);
  const applicationType = signal(0);
  const redirectUri = signal('');
  const secretLabel = signal('');
  const secretExpiry = createClientSecretExpiryFields();
  return {
    clientName,
    application,
    clientType,
    applicationType,
    redirectUri,
    secretLabel,
    secretExpiry,
    nameInput: new Input({
      value: clientName,
      maxLength: 255,
      validator: textValidator(1, 255, false),
    }),
    redirectInput: new Input({ value: redirectUri, maxLength: 2_048 }),
    secretLabelInput: new Input({
      value: secretLabel,
      maxLength: 255,
      validator: textValidator(0, 255),
    }),
    applicationPicker: new ComboBox<AdminApplication>({
      items: signal(activeApplications),
      getText: (item) => item.name,
      value: application,
      editable: false,
    }),
  };
}

/** Converts validated compact form values into an SDK create request. */
function registrationPayload(form: RegistrationForm): Omit<CreateClientInput, 'organizationId'> {
  const application = form.application.peek();
  if (!application) throw new Error('A validated application is required.');
  const applicationTypes = ['web', 'native', 'spa'] as const;
  const applicationType = applicationTypes[form.applicationType.peek()];
  if (!applicationType) throw new Error('A validated application type is required.');
  const clientType = form.clientType.peek() === 0 ? 'public' : 'confidential';
  const input: Omit<CreateClientInput, 'organizationId'> = {
    applicationId: application.id,
    clientName: form.clientName.peek(),
    clientType,
    applicationType,
    redirectUris: [form.redirectUri.peek()],
  };
  const secretLabel = form.secretLabel.peek();
  if (clientType === 'confidential') {
    if (secretLabel) input.secretLabel = secretLabel;
    const secretExpiresAt = form.secretExpiry.expiresAt();
    if (secretExpiresAt) input.secretExpiresAt = secretExpiresAt;
  }
  return input;
}

/** Opens compact OIDC client registration using server defaults for advanced fields. */
export async function showClientRegistrationDialog(
  host: AdminClientRegistrationDialogHost,
  operationSignal: AbortSignal,
  options: AdminClientRegistrationDialogOptions,
): Promise<AdminClientRegistrationDialogResult> {
  const form = createRegistrationForm(options.applications);
  const { width, height } = registrationDialogSize(host);
  const dialog = new ClientRegistrationDialog(width, height, form);
  const formScroller = registrationFormScroller(dialog, form, options.organization);
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        grow(formScroller),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            new Button('~C~reate', {
              command: Commands.ok,
              default: true,
              disabled: () => !registrationIsValid(form),
            }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );
  const command = await runRegistrationDialog(host, dialog, operationSignal);
  return command === Commands.ok
    ? { kind: 'create', input: registrationPayload(form) }
    : { kind: 'cancel' };
}
