/** Focused OIDC client credential dialogs and their shared secret-expiry composition. */

import {
  addDays,
  addMonths,
  col,
  ComboBox,
  compare,
  DatePicker,
  fixed,
  fromDate,
  grow,
  Group,
  Label,
  row,
  Show,
  signal,
  Text,
  toISO,
} from '@jsvision/ui';
import type { CalendarDate } from '@jsvision/ui';

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
