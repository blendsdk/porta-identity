/** Shared human-readable formatting for timestamps on administrative surfaces. */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Formats one timestamp in a concise, stable UTC representation. */
export function formatAdminDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unknown';
  const date = new Date(timestamp);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()] ?? 'Unknown';
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

/** Formats an optional timestamp or returns its context-specific empty label. */
export function formatOptionalAdminDateTime(value: string | null, fallback: string): string {
  return value === null ? fallback : formatAdminDateTime(value);
}
