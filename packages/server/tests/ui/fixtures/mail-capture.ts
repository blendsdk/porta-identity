/**
 * Mail capture Playwright fixture — MailHog API integration for UI tests.
 *
 * Provides a `mailCapture` fixture to capture and inspect emails sent by
 * the Porta server during browser-level tests. Uses the MailHog REST API
 * (running on port 8025 as part of Docker Compose infrastructure).
 *
 * Follows the same MailHog API patterns as `tests/e2e/helpers/mailhog.ts`
 * but exposed as a Playwright test fixture for automatic lifecycle management.
 *
 * Key design decisions:
 *   - Polling-based waitForEmail() with 500ms intervals (up to configurable timeout)
 *   - deleteAll() for cleanup between tests — prevents cross-test email leakage
 *   - Simple URL path-based token extraction — no complex HTML parsing
 *   - Uses MailHog v2 search API for efficient recipient filtering
 *
 * @example
 * ```ts
 * import { test, expect } from '../fixtures/test-fixtures.js';
 *
 * test('password reset email arrives', async ({ mailCapture }) => {
 *   await mailCapture.deleteAll();
 *   // ... trigger password reset ...
 *   const email = await mailCapture.waitForEmail('user@test.com', {
 *     subject: 'Reset',
 *   });
 *   const link = mailCapture.extractLink(email, /\/reset\/[A-Za-z0-9_-]+/);
 *   expect(link).toBeTruthy();
 * });
 * ```
 */

import { TEST_MAILHOG_URL } from '../../helpers/constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed email message from MailHog API */
export interface MailMessage {
  /** MailHog internal message ID */
  id: string;
  /** Sender email address */
  from: string;
  /** Recipient email addresses */
  to: string[];
  /** Email subject line */
  subject: string;
  /** Plaintext body (decoded from MIME) */
  body: string;
  /** HTML body (decoded from MIME, empty string if no HTML part) */
  htmlBody: string;
  /** When MailHog received the message */
  timestamp: Date;
}

/** Options for waitForEmail — filtering and timeout control */
export interface WaitForEmailOptions {
  /** Maximum wait time in milliseconds (default: 10000) */
  timeout?: number;
  /** Only match emails whose subject contains this substring */
  subject?: string;
  /** Only match emails received after this timestamp */
  after?: Date;
}

/** Raw MailHog API v2 response shape */
interface MailHogApiResponse {
  total: number;
  count: number;
  start: number;
  items: MailHogApiItem[];
}

/** Raw MailHog message item from the API */
interface MailHogApiItem {
  ID: string;
  From: { Relays: string[] | null; Mailbox: string; Domain: string; Params: string };
  To: Array<{ Relays: string[] | null; Mailbox: string; Domain: string; Params: string }>;
  Content: {
    Headers: Record<string, string[]>;
    Body: string;
    Size: number;
    MIME: {
      Parts?: Array<{
        Headers: Record<string, string[]>;
        Body: string;
      }>;
    } | null;
  };
  Created: string;
  Raw: { From: string; To: string[]; Data: string; Helo: string };
}

// ---------------------------------------------------------------------------
// MailCapture Interface (exposed as fixture)
// ---------------------------------------------------------------------------

/**
 * Mail capture fixture interface — methods available in test functions.
 *
 * Each method is documented for use in Playwright spec files.
 */
export interface MailCapture {
  /** Wait for an email to arrive for the given recipient */
  waitForEmail(to: string, options?: WaitForEmailOptions): Promise<MailMessage>;

  /** Extract a URL from an email body matching a regex pattern */
  extractLink(email: MailMessage, pattern: RegExp): string | null;

  /** Extract a token from a URL path (last path segment) */
  extractToken(url: string): string;

  /** Delete all emails from MailHog (cleanup between tests) */
  deleteAll(): Promise<void>;

  /** Search for emails matching criteria */
  search(query: string, kind?: 'from' | 'to' | 'containing'): Promise<MailMessage[]>;
}

// ---------------------------------------------------------------------------
// Quoted-Printable Decoder
// ---------------------------------------------------------------------------

/**
 * Decode a quoted-printable encoded string.
 *
 * Quoted-printable encoding (RFC 2045 §6.7) wraps long lines using
 * soft line breaks (`=\r\n` or `=\n`) and encodes non-printable
 * characters as `=XX` hex pairs. Email bodies commonly use this
 * encoding for text/plain and text/html MIME parts.
 *
 * This is critical for extracting URLs from email bodies — long URLs
 * are split across lines with `=` continuations, which breaks naive
 * regex extraction.
 *
 * @param str - Raw quoted-printable encoded string
 * @returns Decoded string with soft breaks removed and hex sequences resolved
 */
function decodeQuotedPrintable(str: string): string {
  return str
    // Remove soft line breaks (=\r\n or =\n) — line continuations
    .replace(/=\r?\n/g, '')
    // Decode =XX hex sequences (e.g., =3D → '=', =20 → ' ')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Base URL for MailHog HTTP API */
const MAILHOG_BASE = TEST_MAILHOG_URL;

/** Polling interval for waitForEmail (milliseconds) */
const POLL_INTERVAL_MS = 500;

/** Default timeout for waitForEmail (milliseconds) */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Parse a raw MailHog API item into our simplified MailMessage.
 *
 * Extracts headers, decodes MIME parts for body/html, and builds
 * a clean interface for test assertions.
 *
 * @param item - Raw MailHog API response item
 * @returns Parsed MailMessage with clean fields
 */
function parseMessage(item: MailHogApiItem): MailMessage {
  // Extract sender from headers or Raw
  const fromHeader = item.Content.Headers['From']?.[0] ?? item.Raw.From;
  // Extract recipients from To header
  const toHeader = item.Content.Headers['To'] ?? item.Raw.To;
  // Subject from headers
  const subject = item.Content.Headers['Subject']?.[0] ?? '';

  // Parse body and HTML from MIME parts
  let body = '';
  let htmlBody = '';

  if (item.Content.MIME?.Parts && item.Content.MIME.Parts.length > 0) {
    // Multi-part MIME — extract text/plain and text/html parts.
    // Always decode quoted-printable — Nodemailer uses it by default
    // and long URLs are split across lines with `=` continuations
    // which breaks regex-based link extraction. Decoding is harmless
    // for non-QP content in this test context.
    for (const part of item.Content.MIME.Parts) {
      const contentType = part.Headers['Content-Type']?.[0] ?? '';
      const decoded = decodeQuotedPrintable(part.Body);
      if (contentType.includes('text/plain')) {
        body = decoded;
      } else if (contentType.includes('text/html')) {
        htmlBody = decoded;
      }
    }
  } else {
    // Single-part message — body is in Content.Body.
    body = decodeQuotedPrintable(item.Content.Body);
  }

  return {
    id: item.ID,
    from: fromHeader,
    to: Array.isArray(toHeader) ? toHeader : [toHeader],
    subject,
    body,
    htmlBody,
    timestamp: new Date(item.Created),
  };
}

/**
 * Search MailHog API for messages matching a query.
 *
 * Uses the v2 search endpoint with kind-based filtering.
 *
 * @param query - Search term (email address or text)
 * @param kind - Search kind: 'from', 'to', or 'containing' (default: 'to')
 * @returns Parsed messages matching the query
 */
async function searchMessages(
  query: string,
  kind: 'from' | 'to' | 'containing' = 'to',
): Promise<MailMessage[]> {
  const url = `${MAILHOG_BASE}/api/v2/search?kind=${kind}&query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MailHog search failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as MailHogApiResponse;
  return data.items.map(parseMessage);
}

/**
 * Wait for an email to arrive for a specific recipient.
 *
 * Polls the MailHog API at POLL_INTERVAL_MS intervals until an email
 * matching the criteria arrives or the timeout is reached.
 *
 * @param to - Recipient email address to search for
 * @param options - Timeout, subject filter, and after-timestamp filter
 * @returns The matching email message
 * @throws Error if no matching email arrives within the timeout
 */
async function waitForEmail(to: string, options?: WaitForEmailOptions): Promise<MailMessage> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const messages = await searchMessages(to, 'to');

    // Filter by optional criteria
    const match = messages.find((msg) => {
      // Subject filter — case-insensitive substring match
      if (options?.subject && !msg.subject.toLowerCase().includes(options.subject.toLowerCase())) {
        return false;
      }
      // After filter — only emails received after the given timestamp
      if (options?.after && msg.timestamp <= options.after) {
        return false;
      }
      return true;
    });

    if (match) return match;

    // Poll interval — wait before retrying
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Build a descriptive error with all search criteria for debugging
  const criteria = [`to: ${to}`];
  if (options?.subject) criteria.push(`subject containing: "${options.subject}"`);
  if (options?.after) criteria.push(`after: ${options.after.toISOString()}`);
  throw new Error(`No email matching [${criteria.join(', ')}] within ${timeout}ms`);
}

/**
 * Extract a URL from an email body matching a regex pattern.
 *
 * Searches the plaintext body first, then falls back to HTML body.
 * Returns the first match or null if no match found.
 *
 * @param email - The email message to search
 * @param pattern - Regex pattern that matches the desired URL/path
 * @returns The matched string, or null if not found
 */
function extractLink(email: MailMessage, pattern: RegExp): string | null {
  // Try plaintext body first
  const textMatch = email.body.match(pattern);
  if (textMatch) return textMatch[0];

  // Fall back to HTML body
  const htmlMatch = email.htmlBody.match(pattern);
  if (htmlMatch) return htmlMatch[0];

  return null;
}

/**
 * Extract a token from a URL path — returns the last path segment.
 *
 * Tokens in Porta URLs are always the final path segment, e.g.:
 *   /test-org/auth/reset-password/abc123token → "abc123token"
 *
 * @param url - The URL (absolute or relative) containing the token
 * @returns The last path segment (the token)
 */
function extractToken(url: string): string {
  // Handle both absolute URLs and relative paths
  const pathname = url.startsWith('http') ? new URL(url).pathname : url;
  const segments = pathname.split('/').filter(Boolean);
  return segments[segments.length - 1];
}

/**
 * Delete all captured emails from MailHog.
 *
 * Call this in test setup (beforeEach) to ensure clean email state.
 * Uses the MailHog v1 DELETE endpoint.
 */
async function deleteAll(): Promise<void> {
  const response = await fetch(`${MAILHOG_BASE}/api/v1/messages`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`MailHog deleteAll failed: ${response.status} ${response.statusText}`);
  }
}

// ---------------------------------------------------------------------------
// Fixture Factory
// ---------------------------------------------------------------------------

/**
 * Create a MailCapture instance with all methods bound.
 *
 * Used by the Playwright fixture extension in test-fixtures.ts.
 * Returns a plain object implementing the MailCapture interface.
 *
 * @returns MailCapture instance ready for use in tests
 */
export function createMailCapture(): MailCapture {
  return {
    waitForEmail,
    extractLink,
    extractToken,
    deleteAll,
    search: searchMessages,
  };
}
