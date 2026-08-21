/** Cryptographic protection for durable account-recovery work. */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { z } from 'zod';
import { config } from '../config/index.js';
import type { ProtectedRecoveryAddress, RecoveryJobType } from './recovery-job-repository.js';

const ADDRESS_CONTEXT = 'porta/recovery-address/v1';
const IDEMPOTENCY_CONTEXT = 'porta/recovery-idempotency/v1';
const TOKEN_CONTEXT = 'porta/recovery-token/v1';
const ALGORITHM = 'aes-256-gcm';
const addressSchema = z.string().trim().toLowerCase().email().max(255);

/** Public authority fields used to identify one recovery operation. */
export interface RecoveryRequestAuthority {
  /** Resolved tenant UUID. */
  readonly organizationId: string;
  /** Closed recovery operation. */
  readonly jobType: RecoveryJobType;
  /** OIDC interaction binding for magic links. */
  readonly interactionUid: string | null;
}

/** Durable authority fields authenticated with every protected address. */
export interface RecoveryAddressAuthority extends RecoveryRequestAuthority {
  /** Keyed request identity persisted beside the encrypted address. */
  readonly idempotencyDigest: string;
}

/** Normalize and validate a public recovery email address. */
export function normalizeRecoveryAddress(address: string): string {
  return addressSchema.parse(address);
}

function deriveKey(secret: string, context: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), context, 32));
}

function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('base64url').slice(0, 22);
}

function aad(authority: RecoveryAddressAuthority): Buffer {
  return Buffer.from(
    JSON.stringify([
      ADDRESS_CONTEXT,
      authority.organizationId,
      authority.jobType,
      authority.interactionUid,
      authority.idempotencyDigest,
    ]),
  );
}

/** Encrypt a normalized recovery address with the active rotating cookie key. */
export function protectRecoveryAddress(
  address: string,
  authority: RecoveryAddressAuthority,
): ProtectedRecoveryAddress {
  const normalized = normalizeRecoveryAddress(address);
  const key = deriveKey(config.cookieKeys[0], ADDRESS_CONTEXT);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad(authority));
  const encoded = Buffer.from(normalized, 'utf8');
  if (encoded.length > 510) throw new Error('Normalized recovery address is too large');
  const padded = randomBytes(512);
  padded.writeUInt16BE(encoded.length, 0);
  encoded.copy(padded, 2);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    keyId: keyId(key),
  };
}

/** Decrypt and authenticate a protected recovery address using the retained key ring. */
export function revealRecoveryAddress(
  protectedAddress: ProtectedRecoveryAddress,
  authority: RecoveryAddressAuthority,
): string {
  for (const secret of config.cookieKeys) {
    const key = deriveKey(secret, ADDRESS_CONTEXT);
    if (keyId(key) !== protectedAddress.keyId) continue;
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(protectedAddress.iv, 'base64url'),
    );
    decipher.setAAD(aad(authority));
    decipher.setAuthTag(Buffer.from(protectedAddress.tag, 'base64url'));
    const padded = Buffer.concat([
      decipher.update(Buffer.from(protectedAddress.ciphertext, 'base64url')),
      decipher.final(),
    ]);
    if (padded.length !== 512) throw new Error('Protected recovery address has invalid length');
    const length = padded.readUInt16BE(0);
    if (length > 510) throw new Error('Protected recovery address has invalid content');
    return normalizeRecoveryAddress(padded.subarray(2, 2 + length).toString('utf8'));
  }
  throw new Error('Protected recovery address key is unavailable');
}

/** Derive a non-reversible idempotency digest for one admitted public action. */
export function recoveryIdempotencyDigest(
  authority: RecoveryRequestAuthority,
  actionNonce: string,
): string {
  const key = deriveKey(config.cookieKeys[0], IDEMPOTENCY_CONTEXT);
  return createHmac('sha256', key)
    .update(JSON.stringify([authority.organizationId, authority.jobType, authority.interactionUid]))
    .update('\0')
    .update(actionNonce)
    .digest('hex');
}

/** Derive the stable unpredictable plaintext token owned by one durable job. */
export function recoveryArtifactToken(
  jobId: string,
  jobType: RecoveryJobType,
  addressKeyId: string,
): string {
  const secret = config.cookieKeys.find((candidate) => {
    const addressKey = deriveKey(candidate, ADDRESS_CONTEXT);
    return keyId(addressKey) === addressKeyId;
  });
  if (!secret) throw new Error('Recovery artifact key is unavailable');
  const key = deriveKey(secret, TOKEN_CONTEXT);
  return createHmac('sha256', key).update(jobType).update('\0').update(jobId).digest('base64url');
}
