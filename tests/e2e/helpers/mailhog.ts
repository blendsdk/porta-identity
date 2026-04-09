/**
 * MailHog API client for verifying email delivery in E2E and integration tests.
 *
 * Connects to MailHog's REST API to retrieve and inspect captured emails.
 * Used to verify that auth workflow emails (magic link, password reset,
 * invitation) are actually delivered with correct content.
 *
 * MailHog runs as part of the Docker Compose infrastructure on port 8025.
 * The SMTP endpoint (port 1025) captures all sent emails; this client
 * reads them via the HTTP API.
 *
 * @example
 *   const mailhog = new MailHogClient();
 *   await mailhog.clearAll();
 *   // ... trigger email send ...
 *   const msg = await mailhog.waitForMessage('user@test.com');
 *   expect(msg.subject).toContain('Magic Link');
 */

import { TEST_MAILHOG_URL } from '../../helpers/constants.js';

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
// Client
// ---------------------------------------------------------------------------

/**
 * MailHog API client for verifying email delivery in tests.
 *
 * Wraps the MailHog v2 REST API with convenience methods for
 * retrieving, filtering, and inspecting captured emails.
 */
export class MailHogClient {
  /** Base URL for MailHog HTTP API (default: http://localhost:8025) */
  protected baseUrl: string;

  constructor(baseUrl: string = TEST_MAILHOG_URL) {
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
   * Polls the MailHog API at 250ms intervals until a message arrives
   * or the timeout is reached. Useful when the email send is async
   * and may not be immediately available.
   *
   * @param email - Recipient email to wait for
   * @param timeoutMs - Maximum wait time in milliseconds (default: 10000)
   * @returns The message once it arrives
   * @throws Error if no message arrives within the timeout
   */
  async waitForMessage(email: string, timeoutMs = 10000): Promise<MailHogMessage> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const msg = await this.getLatestFor(email);
      if (msg) return msg;

      // Poll every 250ms
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`No email received for ${email} within ${timeoutMs}ms`);
  }

  /**
   * Extract a URL link from an email body matching a pattern.
   *
   * Searches the plaintext body (and falls back to HTML) for a URL
   * matching the given regex pattern.
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
   * Call this in beforeEach() to ensure clean state.
   */
  async clearAll(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/messages`, {
      method: 'DELETE',
    });
    // MailHog returns 200 on success
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
      // Multi-part MIME — extract text/plain and text/html parts
      for (const part of item.Content.MIME.Parts) {
        const contentType = part.Headers['Content-Type']?.[0] ?? '';
        if (contentType.includes('text/plain')) {
          body = part.Body;
        } else if (contentType.includes('text/html')) {
          html = part.Body;
        }
      }
    } else {
      // Single-part message — body is in Content.Body
      body = item.Content.Body;
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
