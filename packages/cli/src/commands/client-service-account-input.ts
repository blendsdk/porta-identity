/**
 * Bounded local input for service-account binding management.
 *
 * The CLI validates the complete policy document before it constructs an SDK
 * client, so malformed or oversized input never reaches the network. Read
 * failures, invalid UTF-8, invalid JSON and policy violations all collapse to
 * one safe local error without echoing the supplied path, content or values.
 *
 * @module commands/client-service-account-input
 */

import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type {
  ClientServiceAccountClaimReference,
  ClientServiceAccountRoleReference,
  ClientServiceAccountTarget,
  SetClientServiceAccountInput,
} from '@portaidentity/sdk';
import { LocalInputError } from '../error-format.js';

/** Maximum accepted policy document size, matching the server request limit. */
export const MAX_SERVICE_ACCOUNT_POLICY_BYTES = 102_400;

/** Maximum distinct organizations in one complete policy. */
const MAX_TARGETS = 100;

/** Maximum role occurrences across all targets. */
const MAX_ROLES = 100;

/** Maximum claim-definition occurrences across all targets. */
const MAX_CLAIMS = 100;

/** Canonical UUID spelling accepted for every identifier in the document. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pragmatic address shape; the server owns the authoritative email policy. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Return true for a plain object, never for an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Require the exact closed key set so unknown fields cannot be silently ignored. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** Reject every document that is not the approved complete policy shape. */
function parsePolicy(value: unknown): SetClientServiceAccountInput {
  if (!isRecord(value) || !hasExactKeys(value, ['targets'])) throw new LocalInputError();
  const rawTargets = value.targets;
  if (!Array.isArray(rawTargets) || rawTargets.length < 1 || rawTargets.length > MAX_TARGETS) {
    throw new LocalInputError();
  }

  const organizations = new Set<string>();
  let roleOccurrences = 0;
  let claimOccurrences = 0;
  const targets: ClientServiceAccountTarget[] = [];

  for (const rawTarget of rawTargets) {
    if (!isRecord(rawTarget) ||
        !hasExactKeys(rawTarget, ['organizationId', 'allowedRoles', 'allowedClaimDefinitions'])) {
      throw new LocalInputError();
    }
    const organizationId = rawTarget.organizationId;
    if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) {
      throw new LocalInputError();
    }
    const organizationKey = organizationId.toLowerCase();
    if (organizations.has(organizationKey)) throw new LocalInputError();
    organizations.add(organizationKey);

    const rawRoles = rawTarget.allowedRoles;
    const rawClaims = rawTarget.allowedClaimDefinitions;
    if (!Array.isArray(rawRoles) || !Array.isArray(rawClaims)) throw new LocalInputError();
    roleOccurrences += rawRoles.length;
    claimOccurrences += rawClaims.length;
    if (roleOccurrences > MAX_ROLES || claimOccurrences > MAX_CLAIMS) throw new LocalInputError();

    const allowedRoles: ClientServiceAccountRoleReference[] = [];
    const rolePairs = new Set<string>();
    for (const rawRole of rawRoles) {
      if (!isRecord(rawRole) || !hasExactKeys(rawRole, ['applicationId', 'roleId'])) {
        throw new LocalInputError();
      }
      const { applicationId, roleId } = rawRole;
      if (typeof applicationId !== 'string' || !UUID_PATTERN.test(applicationId) ||
          typeof roleId !== 'string' || !UUID_PATTERN.test(roleId)) {
        throw new LocalInputError();
      }
      const pairKey = `${applicationId.toLowerCase()}:${roleId.toLowerCase()}`;
      if (rolePairs.has(pairKey)) throw new LocalInputError();
      rolePairs.add(pairKey);
      allowedRoles.push({ applicationId, roleId });
    }

    const allowedClaimDefinitions: ClientServiceAccountClaimReference[] = [];
    const claimPairs = new Set<string>();
    for (const rawClaim of rawClaims) {
      if (!isRecord(rawClaim) ||
          !hasExactKeys(rawClaim, ['applicationId', 'claimDefinitionId'])) {
        throw new LocalInputError();
      }
      const { applicationId, claimDefinitionId } = rawClaim;
      if (typeof applicationId !== 'string' || !UUID_PATTERN.test(applicationId) ||
          typeof claimDefinitionId !== 'string' || !UUID_PATTERN.test(claimDefinitionId)) {
        throw new LocalInputError();
      }
      const pairKey = `${applicationId.toLowerCase()}:${claimDefinitionId.toLowerCase()}`;
      if (claimPairs.has(pairKey)) throw new LocalInputError();
      claimPairs.add(pairKey);
      allowedClaimDefinitions.push({ applicationId, claimDefinitionId });
    }

    targets.push({ organizationId, allowedRoles, allowedClaimDefinitions });
  }

  return { targets };
}

/** Read at most the configured byte bound from an already-open regular file. */
async function readBounded(handle: FileHandle): Promise<Buffer> {
  const buffer = Buffer.alloc(MAX_SERVICE_ACCOUNT_POLICY_BYTES + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > MAX_SERVICE_ACCOUNT_POLICY_BYTES) {
    throw new LocalInputError();
  }
  return buffer.subarray(0, offset);
}

/**
 * Read and completely validate one service-account policy file.
 *
 * Directories, FIFOs and other non-regular files are refused without blocking.
 * The file is never interpreted as command options and its content is never
 * echoed in an error message.
 *
 * @param path - Operator-supplied regular file path.
 * @returns The validated complete policy.
 * @throws LocalInputError for any read, encoding, JSON or policy failure.
 * @example const policy = await readServiceAccountPolicyFile('./service-account.json');
 */
export async function readServiceAccountPolicyFile(
  path: string,
): Promise<SetClientServiceAccountInput> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_SERVICE_ACCOUNT_POLICY_BYTES) {
      throw new LocalInputError();
    }
    const bytes = await readBounded(handle);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new LocalInputError();
    }
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch {
      throw new LocalInputError();
    }
    return parsePolicy(document);
  } catch (error) {
    if (error instanceof LocalInputError) throw error;
    throw new LocalInputError();
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

/**
 * Validate the optional account email before any SDK client exists.
 *
 * @param value - Email supplied with `--email`.
 * @returns The original value when it has a supported address shape.
 * @throws LocalInputError when the value is not a plausible address.
 */
export function requireServiceAccountEmail(value: string): string {
  if (value.length > 255 || !EMAIL_PATTERN.test(value)) throw new LocalInputError();
  return value;
}

/**
 * Validate the client identifier before any SDK client is constructed.
 *
 * @param value - Positional internal client UUID.
 * @returns The original identifier when it is a UUID.
 * @throws LocalInputError for dot segments or non-UUID text.
 */
export function requireServiceAccountClientId(value: string): string {
  if (value === '.' || value === '..' || !UUID_PATTERN.test(value)) throw new LocalInputError();
  return value;
}
