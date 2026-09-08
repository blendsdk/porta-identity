/** Focused OIDC client credential dialogs and their shared secret-expiry composition. */

import type { GenerateSecretInput } from '@portaidentity/sdk';

import {
  addDays,
  addMonths,
  Button,
  col,
  ComboBox,
  Commands,
  compare,
  cover,
  DatePicker,
  Dialog,
  fixed,
  fromDate,
  grow,
  Group,
  GroupBox,
  Input,
  Label,
  row,
  Show,
  signal,
  spacer,
  Text,
  toISO,
} from '@jsvision/ui';
import type { CalendarDate, EventLoop, ModalDialogHost, Signal } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import { ClientFormScroller } from './client-form-scroller.js';
import type { AdminClient } from './client-state.js';
import { textValidator } from './user-dialog-fields.js';

/** Exact warning shown when an administrator chooses a non-expiring secret. */
export const NEVER_SECRET_EXPIRY_WARNING =
  'This secret will remain valid until it is revoked. Regular rotation is recommended.';

/** Non-blocking warning shown for a selected date beyond the 24-month preset boundary. */
export const LONG_SECRET_EXPIRY_WARNING =
  'This secret expires after 24 months. Regular rotation is recommended.';

/** Closed set of supported secret expiry choices. */
type SecretExpiryChoice =
  | { readonly kind: 'months'; readonly months: 3 | 6 | 12 | 24; readonly label: string }
  | { readonly kind: 'custom'; readonly label: 'Custom' }
  | { readonly kind: 'never'; readonly label: 'Never' };

const SECRET_EXPIRY_CHOICES: readonly SecretExpiryChoice[] = [
  { kind: 'months', months: 3, label: '3 months' },
  { kind: 'months', months: 6, label: '6 months' },
  { kind: 'months', months: 12, label: '12 months' },
  { kind: 'months', months: 24, label: '24 months' },
  { kind: 'custom', label: 'Custom' },
  { kind: 'never', label: 'Never' },
];

/** Feature-local expiry fields shared by registration and credential generation. */
export interface ClientSecretExpiryFields {
  /** Layout DSL content containing the choice, optional calendar, and warning. */
  readonly content: Group;
  /** Returns whether the selected choice contains a valid future civil date. */
  readonly isValid: () => boolean;
  /** Serializes the selected date, or omits expiry when Never is selected. */
  readonly expiresAt: () => string | undefined;
}

/** Modal host needed for abort-driven credential-dialog closure. */
export interface ClientCredentialDialogHost extends ModalDialogHost {
  /** Event loop that can synchronously close an owned modal. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal'>;
}

/** Result of the focused client-secret generation form. */
export type GenerateClientSecretDialogResult =
  | { readonly kind: 'generate'; readonly clientId: string; readonly input?: GenerateSecretInput }
  | { readonly kind: 'cancel' };

/** Secret-generation dialog with one shared validity rule for every submit route. */
class GenerateClientSecretDialog extends Dialog {
  /** Creates a spacious focused credential form. */
  constructor(
    width: number,
    height: number,
    private readonly label: Signal<string>,
    private readonly labelInput: Input,
    private readonly expiry: ClientSecretExpiryFields,
  ) {
    super({ title: 'Generate client secret', width, height, centered: true });
  }

  /** Rejects unsafe labels and invalid custom expiry dates before closing. */
  valid(command: string): boolean {
    if (command === Commands.cancel) return true;
    if (!validLabel(this.label.peek()) || !this.expiry.isValid()) {
      this.firstInvalid = this.labelInput;
      return false;
    }
    return super.valid(command);
  }
}

/** Serializes a selected civil expiry as midnight UTC on the following day. */
function serializeSecretExpiry(date: CalendarDate): string {
  return `${toISO(addDays(date, 1))}T00:00:00.000Z`;
}

/** Resolves the civil expiry date represented by the current selector state. */
function selectedExpiryDate(
  choice: SecretExpiryChoice | null,
  customDate: CalendarDate | null,
  today: CalendarDate,
): CalendarDate | null {
  if (!choice || choice.kind === 'never') return null;
  return choice.kind === 'months' ? addMonths(today, choice.months) : customDate;
}

/** Creates one complete calendar-based secret-expiry selector with a six-month default. */
export function createClientSecretExpiryFields(now: Date = new Date()): ClientSecretExpiryFields {
  const today = fromDate(now);
  const tomorrow = addDays(today, 1);
  const choice = signal<SecretExpiryChoice | null>(SECRET_EXPIRY_CHOICES[1] ?? null);
  const customDate = signal<CalendarDate | null>(tomorrow);
  const picker = new DatePicker({ value: customDate, today, min: tomorrow });
  const choicePicker = new ComboBox<SecretExpiryChoice>({
    items: signal([...SECRET_EXPIRY_CHOICES]),
    getText: (item) => item.label,
    value: choice,
    editable: false,
  });
  const content = col(
    { gap: 0 },
    fixed(row({ gap: 1 }, fixed(new Label('Expires', choicePicker), 18), grow(choicePicker)), 1),
  );
  content.addDynamic(() =>
    Show(
      () => choice()?.kind === 'custom',
      () =>
        fixed(row({ gap: 1 }, fixed(new Label('Custom date', picker.input), 18), grow(picker)), 1),
    ),
  );
  content.addDynamic(() =>
    Show(
      () => {
        const selected = selectedExpiryDate(choice(), customDate(), today);
        return choice()?.kind === 'custom' && (selected === null || compare(selected, today) !== 1);
      },
      () => fixed(new Text('Custom date must be in the future.', { severity: 'error' }), 2),
    ),
  );
  content.addDynamic(() =>
    Show(
      () => choice()?.kind === 'never',
      () => fixed(new Text(NEVER_SECRET_EXPIRY_WARNING), 3),
    ),
  );
  content.addDynamic(() =>
    Show(
      () => {
        const selected = selectedExpiryDate(choice(), customDate(), today);
        return (
          choice()?.kind === 'custom' &&
          selected !== null &&
          compare(selected, addMonths(today, 24)) === 1
        );
      },
      () => fixed(new Text(LONG_SECRET_EXPIRY_WARNING), 3),
    ),
  );
  return {
    content,
    isValid: () => {
      const selected = selectedExpiryDate(choice(), customDate(), today);
      return choice()?.kind === 'never' || (selected !== null && compare(selected, today) === 1);
    },
    expiresAt: () => {
      const selected = selectedExpiryDate(choice.peek(), customDate.peek(), today);
      return selected ? serializeSecretExpiry(selected) : undefined;
    },
  };
}

/** Returns true for an optional bounded label without terminal control characters. */
function validLabel(value: string): boolean {
  if (value.length > 255) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Runs one abortable credential modal and always removes it from the desktop. */
async function runCredentialDialog(
  host: ClientCredentialDialogHost,
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

/** Opens focused label and calendar expiry controls for a new client secret. */
export async function showGenerateClientSecretDialog(
  host: ClientCredentialDialogHost,
  operationSignal: AbortSignal,
  client: AdminClient,
): Promise<GenerateClientSecretDialogResult> {
  const label = signal('');
  const labelInput = new Input({
    value: label,
    maxLength: 255,
    validator: textValidator(0, 255),
  });
  const expiry = createClientSecretExpiryFields();
  const width = Math.max(1, Math.min(68, host.desktop.bounds.width));
  const height = Math.max(1, Math.min(18, host.desktop.bounds.height));
  const dialog = new GenerateClientSecretDialog(width, height, label, labelInput, expiry);
  const fields = new GroupBox({ title: 'Secret details', padding: 1 });
  fields.add(
    cover(
      col(
        { gap: 1 },
        fixed(new Text(`Client: ${client.clientName}`), 1),
        fixed(row({ gap: 1 }, fixed(new Label('Label', labelInput), 18), grow(labelInput)), 1),
        fixed(expiry.content, 7),
        fixed(new Text('The secret value is shown only once after generation.'), 2),
      ),
    ),
  );
  const compact = host.desktop.bounds.height <= 12;
  const formContent = col(fixed(fields, 15));
  const formScroller = new ClientFormScroller(formContent, () => ({
    width: Math.max(1, (dialog.bounds.width || width) - (compact ? 4 : 6)),
    height: 15,
  }));
  const canGenerate = () => validLabel(label()) && expiry.isValid();
  dialog.add(
    cover(
      col(
        {
          gap: compact ? 0 : 1,
          padding: compact
            ? { top: 0, right: 1, bottom: 0, left: 1 }
            : { top: 1, right: 2, bottom: 1, left: 2 },
        },
        grow(formScroller),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            new Button('~G~enerate', {
              command: Commands.ok,
              default: true,
              disabled: () => !canGenerate(),
            }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );
  if ((await runCredentialDialog(host, dialog, operationSignal)) !== Commands.ok) {
    return { kind: 'cancel' };
  }
  const input: GenerateSecretInput = {};
  if (label.peek()) input.label = label.peek();
  const expiresAt = expiry.expiresAt();
  if (expiresAt) input.expiresAt = expiresAt;
  return { kind: 'generate', clientId: client.id, ...(Object.keys(input).length ? { input } : {}) };
}
