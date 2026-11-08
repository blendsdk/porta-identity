/** Bounded local recipient input and complete invitation preparation before SDK construction. */
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { InviteUserInput } from '@portaidentity/sdk';
import { LocalInputError } from './error-format.js';
import {
  parseClaimAssignments,
  parseRoleAssignments,
  validateInvitationEncoding,
} from './parsers.js';

/** Maximum raw file size, including whitespace, BOM and line endings. */
const MAX_BYTES = 1_048_576;
/** Maximum distinct case-insensitive recipient addresses per invocation. */
const MAX_RECIPIENTS = 1000;
/** Current server-compatible ASCII email grammar; this does not claim Unicode equivalence. */
const EMAIL =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
/** UUID shape used by the existing invitation assignment parsers. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First occurrence of one unique address in its physical source file. */
export interface BulkRecipient {
  /** One-based physical line, including blank lines in the source. */
  readonly line: number;
  /** First trimmed spelling, retained for dispatch and reporting. */
  readonly email: string;
}

/** Fully validated unique recipients with source cardinality. */
export interface BulkRecipientInput {
  /** Number of nonblank valid source records, including duplicate lines. */
  readonly inputRecords: number;
  /** Number of repeated case-insensitive addresses. */
  readonly duplicates: number;
  /** Ordered first occurrences only. */
  readonly recipients: readonly BulkRecipient[];
}

/** Shared flags validated once before dispatching any recipient. */
export interface BulkInvitationOptions {
  /** Organization UUID; ownership remains a server decision. */
  readonly org: string;
  /** Optional role assignments using the existing grammar. */
  readonly role?: string[];
  /** Optional qualified JSON claims using the existing parser. */
  readonly claim?: string[];
  /** Locale input, trimmed and omitted when empty. */
  readonly locale?: string;
  /** Unmodified personal message, at most 500 characters. */
  readonly 'personal-message'?: string;
}

/** One complete encodable request paired with its source identity. */
export interface PreparedBulkRecipient extends BulkRecipient {
  /** The same plain request object dispatched through the SDK after preflight. */
  readonly input: InviteUserInput;
}

/** All requests prepared before a client or invitation call exists. */
export interface PreparedBulkInvitations extends Omit<BulkRecipientInput, 'recipients'> {
  /** Ordered requests with their original line and email. */
  readonly recipients: readonly PreparedBulkRecipient[];
}

/** Test an address against the same lexical rule used for input and acknowledgement matching. */
export function isBulkInvitationEmail(value: string): boolean {
  return EMAIL.test(value);
}

/**
 * Normalize physical lines and reject the whole input if any nonblank address is invalid.
 * Only one leading BOM is removed; an interior BOM or bare CR must not disappear through trim.
 * @param text - Strictly decoded UTF-8 text
 * @returns Ordered unique recipients and exact duplicate/input counters
 * @throws LocalInputError for invalid, empty, oversized or excessive recipient input
 * @example parseBulkRecipients('Alice@example.com\nalice@example.com\nbob@example.com')
 */
export function parseBulkRecipients(text: string): BulkRecipientInput {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES)
    throw new LocalInputError('--file exceeds the byte limit.');
  const normalized = text.startsWith('\uFEFF') ? text.slice(1) : text;
  if (/\uFEFF|\r(?!\n)/u.test(normalized)) {
    throw new LocalInputError('--file contains an invalid line separator or interior BOM.');
  }
  const recipients: BulkRecipient[] = [];
  const seen = new Set<string>();
  let inputRecords = 0;
  let duplicates = 0;
  for (const [index, line] of normalized.split(/\r?\n/u).entries()) {
    const email = line.trim();
    if (!email) continue;
    if (!isBulkInvitationEmail(email))
      throw new LocalInputError(`--file line ${index + 1} must contain a valid email address.`);
    inputRecords += 1;
    const key = email.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    recipients.push({ line: index + 1, email });
    if (recipients.length > MAX_RECIPIENTS)
      throw new LocalInputError('--file exceeds the unique recipient limit.');
  }
  if (recipients.length === 0)
    throw new LocalInputError('--file must contain at least one recipient.');
  return { inputRecords, duplicates, recipients };
}

/**
 * Read one regular descriptor with a raw-byte bound and strict UTF-8 decoding.
 * Nonblocking open allows descriptor validation to reject a no-writer POSIX FIFO without hanging.
 * No shell interprets the supplied local path. The descriptor is closed on every opened path.
 * @param path - Literal local recipient filename
 * @returns Validated unique recipients and counters
 * @throws LocalInputError with no path or content when open, read, decode or close fails
 * @example await readBulkRecipients('./recipients.txt')
 */
export async function readBulkRecipients(path: string): Promise<BulkRecipientInput> {
  let handle: FileHandle | undefined;
  let result: BulkRecipientInput | undefined;
  let failure: LocalInputError | undefined;
  try {
    handle = await open(resolve(path), constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > MAX_BYTES)
      throw new LocalInputError('--file must be a regular file within the byte limit.');
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(65_536);
    let total = 0;
    while (true) {
      // One extra byte distinguishes the exact limit from a file that grew after fstat.
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, MAX_BYTES + 1 - total),
        null,
      );
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_BYTES) throw new LocalInputError('--file exceeds the byte limit.');
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    // Preserve BOM bytes for the explicit one-leading-BOM rule in the text parser.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Buffer.concat(chunks, total),
    );
    result = parseBulkRecipients(text);
  } catch (error) {
    failure =
      error instanceof LocalInputError
        ? error
        : new LocalInputError('--file could not be read as valid UTF-8 recipient input.');
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        failure ??= new LocalInputError('--file could not be closed safely.');
      }
    }
  }
  if (failure) throw failure;
  if (!result) throw new LocalInputError('--file could not be read safely.');
  return result;
}

/**
 * Prepare and encode every complete invitation before the caller constructs its SDK client.
 * Local validation is not an authorization catalogue or an atomic server-side preflight.
 * @param recipientInput - Validated recipients from the bounded reader or pure parser
 * @param options - Shared flags, using the conventional invitation grammar
 * @returns The same plain requests later supplied to the SDK, without serialized copies
 * @throws LocalInputError for malformed shared fields or complete-request encoding failure
 * @example prepareBulkInvitations(parseBulkRecipients('person@example.com'), { org: '11111111-1111-4111-8111-111111111111' })
 */
export function prepareBulkInvitations(
  recipientInput: BulkRecipientInput,
  options: BulkInvitationOptions,
): PreparedBulkInvitations {
  if (typeof options.org !== 'string' || !UUID.test(options.org))
    throw new LocalInputError('--org must contain a valid UUID.');
  if (options.locale !== undefined && typeof options.locale !== 'string')
    throw new LocalInputError('--locale must contain a string.');
  if (options['personal-message'] !== undefined && typeof options['personal-message'] !== 'string')
    throw new LocalInputError('--personal-message must contain a string.');
  if (
    options.role !== undefined &&
    (!Array.isArray(options.role) ||
      options.role.some((value: unknown) => typeof value !== 'string'))
  )
    throw new LocalInputError('--role must contain string assignments.');
  const locale = options.locale?.trim();
  const personalMessage = options['personal-message'];
  if (locale && locale.length > 10)
    throw new LocalInputError('--locale must contain at most 10 characters.');
  if (personalMessage && personalMessage.length > 500)
    throw new LocalInputError('--personal-message must contain at most 500 characters.');
  let roles: InviteUserInput['roles'];
  try {
    roles = parseRoleAssignments(options.role);
  } catch {
    throw new LocalInputError('--role must contain valid application and role UUID pairs.');
  }
  const claims = parseClaimAssignments(options.claim);
  const recipients = recipientInput.recipients.map(({ line, email }) => {
    const input: InviteUserInput = {
      organizationId: options.org,
      email,
      ...(roles ? { roles } : {}),
      ...(claims ? { claims } : {}),
      ...(locale ? { locale } : {}),
      ...(personalMessage ? { personalMessage } : {}),
    };
    validateInvitationEncoding(input);
    return { line, email, input };
  });
  return {
    inputRecords: recipientInput.inputRecords,
    duplicates: recipientInput.duplicates,
    recipients,
  };
}
