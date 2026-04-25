/**
 * MailHog API client for Admin GUI E2E tests.
 *
 * Connects to MailHog's REST API to retrieve and inspect captured emails.
 * Used by the auth-setup flow to extract magic link URLs from emails
 * sent by Porta during the OIDC login flow.
 *
 * Adapted from tests/e2e/helpers/mailhog.ts — standalone version with
 * no external dependencies (configurable base URL instead of constants).
 *
 * MailHog runs as part of the Docker Compose infrastructure:
 *   - SMTP endpoint: port 1025 (captures all sent emails)
 *   - HTTP API: port 8025 (this client reads emails here)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed email message from MailHog API */
export interface MailHogMessage {
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
  html: string;
  /** When MailHog received the message */
  receivedAt: Date;
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
 * Critical for extracting URLs from email bodies — long URLs are
 * split across lines with `=` continuations, which breaks naive
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
    .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * MailHog API client for verifying email delivery in E2E tests.
 *
 * Wraps the MailHog v2 REST API with convenience methods for
 * retrieving, filtering, and inspecting captured emails.
 *
 * @example
 *   const mailhog = new MailHogClient('http://localhost:8025');
 *   await mailhog.clearAll();
 *   // ... trigger email send (magic link, etc.) ...
 *   const msg = await mailhog.waitForMessage('admin@porta-test.local');
 *   const link = mailhog.extractMagicLink(msg);
 */
export class MailHogClient {
  /** Base URL for MailHog HTTP API */
  protected baseUrl: string;

  constructor(baseUrl = 'http://localhost:8025') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get all captured messages from MailHog.
   *
   * @param limit - Maximum number of messages to return (default: 50)
   * @returns Array of parsed messages, newest first
   */
  async getMessages(limit = 50): Promise<MailHogMessage[]> {
    const response = await fetch(`${this.baseUrl}/api/v2/messages?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`MailHog API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as MailHogApiResponse;
    return data.items.map(this.parseMessage);
  }

  /**
   * Get the latest message for a specific recipient email.
   *
   * @param email - Recipient email to search for
   * @returns The latest message for that recipient, or null if not found
   */
  async getLatestFor(email: string): Promise<MailHogMessage | null> {
    const messages = await this.getMessages();
    const normalizedEmail = email.toLowerCase();

    const match = messages.find((msg) =>
      msg.to.some((to) => to.toLowerCase() === normalizedEmail),
    );

    return match ?? null;
  }

  /**
   * Wait for a message to arrive for a recipient (with polling).
   *
   * Polls the MailHog API at 500ms intervals until a message arrives
   * or the timeout is reached. Useful when the email send is async
   * and may not be immediately available.
   *
   * @param email - Recipient email to wait for
   * @param timeoutMs - Maximum wait time in milliseconds (default: 15000)
   * @returns The message once it arrives
   * @throws Error if no message arrives within the timeout
   */
  async waitForMessage(email: string, timeoutMs = 15_000): Promise<MailHogMessage> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const msg = await this.getLatestFor(email);
      if (msg) return msg;

      // Poll every 500ms
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`No email received for ${email} within ${timeoutMs}ms`);
  }

  /**
   * Extract a magic link URL from an email message.
   *
   * Searches the HTML body (preferred) and plaintext body for a URL
   * containing '/magic-link' which is Porta's magic link verification path.
   *
   * @param message - The email message to search
   * @returns The magic link URL string
   * @throws Error if no magic link URL is found in the email
   */
  extractMagicLink(message: MailHogMessage): string {
    // Pattern matches URLs containing /magic-link (Porta's magic link path)
    const pattern = /https?:\/\/[^\s"<>]+\/magic-link[^\s"<>]*/;

    // Try HTML body first (more reliable — URLs are in href attributes)
    const htmlMatch = message.html.match(pattern);
    if (htmlMatch) return htmlMatch[0];

    // Fall back to plaintext body
    const textMatch = message.body.match(pattern);
    if (textMatch) return textMatch[0];

    throw new Error(
      `No magic link URL found in email to ${message.to.join(', ')}. ` +
        `Subject: "${message.subject}". ` +
        `Body length: ${message.body.length}, HTML length: ${message.html.length}`,
    );
  }

  /**
   * Extract a URL link from an email body matching a custom pattern.
   *
   * @param message - The email message to search
   * @param pattern - Regex pattern that matches the desired URL
   * @returns The matched URL string, or null if not found
   */
  extractLink(message: MailHogMessage, pattern: RegExp): string | null {
    // Try plaintext body first
    const textMatch = message.body.match(pattern);
    if (textMatch) return textMatch[0];

    // Fall back to HTML body
    const htmlMatch = message.html.match(pattern);
    if (htmlMatch) return htmlMatch[0];

    return null;
  }

  /**
   * Delete all captured messages from MailHog.
   * Call this before auth flows to ensure clean state.
   */
  async clearAll(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/messages`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`MailHog clear failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Parse a raw MailHog API item into our simplified MailHogMessage.
   *
   * Extracts headers, decodes MIME parts for body/html, and builds
   * a clean interface for test assertions.
   */
  protected parseMessage(item: MailHogApiItem): MailHogMessage {
    // Extract sender from headers or Raw
    const fromHeader = item.Content.Headers['From']?.[0] ?? item.Raw.From;
    // Extract recipients from To header
    const toHeader = item.Content.Headers['To'] ?? item.Raw.To;
    // Subject from headers
    const subject = item.Content.Headers['Subject']?.[0] ?? '';

    // Parse body and HTML from MIME parts
    let body = '';
    let html = '';

    if (item.Content.MIME?.Parts && item.Content.MIME.Parts.length > 0) {
      // Multi-part MIME — extract text/plain and text/html parts.
      // Always decode quoted-printable — Nodemailer uses it by default
      // and long URLs are split across lines with `=` continuations.
      for (const part of item.Content.MIME.Parts) {
        const contentType = part.Headers['Content-Type']?.[0] ?? '';
        const decoded = decodeQuotedPrintable(part.Body);
        if (contentType.includes('text/plain')) {
          body = decoded;
        } else if (contentType.includes('text/html')) {
          html = decoded;
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
      html,
      receivedAt: new Date(item.Created),
    };
  }
}
