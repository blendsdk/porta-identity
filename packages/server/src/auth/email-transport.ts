/**
 * Pluggable email transport abstraction.
 *
 * Defines a transport interface and provides a default SMTP implementation
 * using Nodemailer. The interface allows swapping transports for testing
 * (mock transport) or future providers (SES, SendGrid, etc.).
 *
 * SMTP configuration is read from the app config (`config.smtp.*`).
 * Auth is only applied when `smtp.user` is provided — MailHog in dev
 * doesn't need authentication.
 *
 * @example
 *   const transport = createSmtpTransport();
 *   const result = await transport.send({
 *     to: 'user@example.com',
 *     subject: 'Welcome',
 *     html: '<h1>Hello</h1>',
 *     text: 'Hello',
 *   });
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for sending an email */
export interface SendEmailOptions {
  /** Recipient email address */
  to: string;
  /** Sender address — falls back to config.smtp.from if not provided */
  from?: string;
  /** Email subject line */
  subject: string;
  /** HTML body */
  html: string;
  /** Plaintext body (fallback for clients that don't render HTML) */
  text: string;
  /** Reply-to address (optional) */
  replyTo?: string;
}

/** Result of sending an email */
export interface EmailResult {
  /** SMTP message ID */
  messageId: string;
  /** Email addresses that accepted the message */
  accepted: string[];
  /** Email addresses that rejected the message */
  rejected: string[];
}

/** Pluggable transport interface — SMTP is the default, others can be added */
export interface EmailTransport {
  /** Send an email with the given options */
  send(options: SendEmailOptions): Promise<EmailResult>;
}

// ---------------------------------------------------------------------------
// SMTP Transport
// ---------------------------------------------------------------------------

/**
 * Create an SMTP email transport using Nodemailer.
 *
 * Reads SMTP configuration from the app config:
 *   - `config.smtp.host` — SMTP server hostname
 *   - `config.smtp.port` — SMTP port (465 = TLS, 587 = STARTTLS, 1025 = MailHog)
 *   - `config.smtp.user` — Username (optional, omit for MailHog)
 *   - `config.smtp.pass` — Password (optional)
 *   - `config.smtp.from` — Default sender address
 *
 * @returns EmailTransport implementation backed by Nodemailer SMTP
 */
export function createSmtpTransport(): EmailTransport {
  // Build Nodemailer transport options from config
  const transportOptions: nodemailer.TransportOptions & {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  } = {
    host: config.smtp.host,
    port: config.smtp.port,
    // Port 465 uses implicit TLS; other ports use STARTTLS or plain
    secure: config.smtp.port === 465,
  };

  // Only add auth when credentials are provided (MailHog doesn't need auth)
  if (config.smtp.user) {
    transportOptions.auth = {
      user: config.smtp.user,
      pass: config.smtp.pass ?? '',
    };
  }

  const transporter: Transporter = nodemailer.createTransport(transportOptions);

  return {
    /**
     * Send an email via SMTP.
     *
     * @param options - Email send options
     * @returns Result with messageId and accepted/rejected addresses
     */
    async send(options: SendEmailOptions): Promise<EmailResult> {
      const from = options.from ?? config.smtp.from;

      logger.debug(
        { to: options.to, subject: options.subject, from },
        'Sending email via SMTP',
      );

      const info = await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
      });

      return {
        messageId: info.messageId,
        accepted: Array.isArray(info.accepted)
          ? info.accepted.map(String)
          : [],
        rejected: Array.isArray(info.rejected)
          ? info.rejected.map(String)
          : [],
      };
    },
  };
}
