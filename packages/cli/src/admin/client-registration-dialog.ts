/** Compact registration dialog for creating one OIDC client from server-backed defaults. */

import type { EventLoop, ModalDialogHost, Signal } from '@jsvision/ui';
import {
  Button,
  col,
  ComboBox,
  Commands,
  cover,
  Dialog,
  fixed,
  GroupBox,
  grow,
  Input,
  Label,
  RadioGroup,
  row,
  signal,
  spacer,
  Text,
} from '@jsvision/ui';
import type { CreateClientInput } from '@portaidentity/sdk';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminApplication } from './application-state.js';
import type { AdminOrganizationContext } from './state.js';
import { textValidator } from './user-dialog-fields.js';

/** One empty row separates each adjacent form component and the dialog action area. */
const REGISTRATION_FORM_GAP = 1;

/** Create and Cancel use their natural two-row button height, including the button shadow. */
const REGISTRATION_ACTIONS_HEIGHT = 2;

/**
 * Calculates the Client details group height from its visible component heights and spacing.
 * GroupBox padding provides the one-row inset needed to keep content inside each frame edge.
 */
function clientDetailsGroupHeight(): number {
  const componentHeights = [1, 1, 1, 2, 3, 1];
  const componentGaps = (componentHeights.length - 1) * REGISTRATION_FORM_GAP;
  const groupFrameInset = 2;
  return (
    componentHeights.reduce((total, height) => total + height, 0) + componentGaps + groupFrameInset
  );
}

/**
 * Calculates the complete dialog height without relying on a scrolling content surface.
 * The dialog frame contributes two rows and the form keeps one top-padding row.
 */
function registrationDialogHeight(): number {
  const dialogFrameAndFormPadding = 3;
  return (
    clientDetailsGroupHeight() +
    REGISTRATION_FORM_GAP +
    REGISTRATION_ACTIONS_HEIGHT +
    dialogFrameAndFormPadding
  );
}

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
  /** Client-name control used when validation rejects submission. */
  readonly nameInput: Input;
  /** Redirect control used when validation rejects submission. */
  readonly redirectInput: Input;
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
    validRedirectUri(form.redirectUri())
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
    height: Math.max(1, Math.min(registrationDialogHeight(), host.desktop.bounds.height)),
  };
}

/** Runs one abortable modal and removes it regardless of its completion path. */
async function runRegistrationDialog(
  host: AdminClientRegistrationDialogHost,
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

/** Builds the complete non-scrolling registration layout. */
function registrationLayout(
  form: RegistrationForm,
  organization: AdminOrganizationContext,
): ReturnType<typeof col> {
  return col(
    {
      gap: REGISTRATION_FORM_GAP,
      padding: { top: 1, right: 2, bottom: 0, left: 2 },
    },
    fixed(clientDetailsGroup(form, organization), clientDetailsGroupHeight()),
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
      REGISTRATION_ACTIONS_HEIGHT,
    ),
  );
}

/** Creates the signals and controls for one compact registration attempt. */
function createRegistrationForm(applications: readonly AdminApplication[]): RegistrationForm {
  const activeApplications = applications.filter((application) => application.status === 'active');
  const clientName = signal('');
  const application = signal<AdminApplication | null>(activeApplications[0] ?? null);
  const clientType = signal(1);
  const applicationType = signal(0);
  const redirectUri = signal('');
  return {
    clientName,
    application,
    clientType,
    applicationType,
    redirectUri,
    nameInput: new Input({
      value: clientName,
      maxLength: 255,
      validator: textValidator(1, 255, false),
    }),
    redirectInput: new Input({ value: redirectUri, maxLength: 2_048 }),
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
  dialog.add(cover(registrationLayout(form, options.organization)));
  const command = await runRegistrationDialog(host, dialog, operationSignal);
  return command === Commands.ok
    ? { kind: 'create', input: registrationPayload(form) }
    : { kind: 'cancel' };
}
