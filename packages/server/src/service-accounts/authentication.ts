import { z } from 'zod';
import { runDatabaseTransaction } from '../lib/database.js';
import {
  requireServiceAccountAuthority, SERVICE_ACCOUNT_INVITE_SCOPE,
  SERVICE_ACCOUNT_NAMESPACE, serviceAccountIdentitySchema,
} from './authorization.js';
import type { ServiceAccountAuthority, ServiceAccountIdentity } from './authorization.js';

/** Native client-credentials lookup, deliberately separate from AccessToken and human identity. */
export interface ServiceAccountTokenProvider {
  /** Native provider model; no synthetic service user lookup or token exchange is allowed. */
  readonly ClientCredentials?: {
    /** Resolve the genuine opaque artifact; storage failure must propagate as unavailable. */
    find(token: string): Promise<unknown>;
  };
}

/** Minimal native artifact projection, checked at runtime before granting the invitation lane. */
const nativeSchema = z.object({
  kind: z.literal('ClientCredentials'), clientId: z.string().min(1),
  scope: z.string(), exp: z.number().finite(), isValid: z.literal(true),
  extra: z.object({ [SERVICE_ACCOUNT_NAMESPACE]: serviceAccountIdentitySchema }),
});

/** Authenticated machine identity whose live authority must be rechecked inside dispatch. */
export interface AuthenticatedServiceAccount {
  /** Exact closed server-issued identity, never a human role/permission projection. */
  readonly identity: ServiceAccountIdentity;
  /** Live locked authority established by native lookup. */
  readonly authority: ServiceAccountAuthority;
  /** Validated native expiry in epoch seconds; only for elapsed-time admission checks. */
  readonly tokenExpiresAt: number;
}

/**
 * Resolve only a real native artifact with strict expiry and validated live ownership.
 * Missing/malformed artifacts return null; live denial and dependency errors remain distinct.
 */
export async function authenticateServiceAccount(
  provider: ServiceAccountTokenProvider, token: string,
): Promise<AuthenticatedServiceAccount | null> {
  if (!provider.ClientCredentials) return null;
  const native = await provider.ClientCredentials.find(token);
  // Native models expose accessor properties. Read them explicitly rather than spreading the
  // instance, which would silently omit strict expiry and model identity getters.
  if (typeof native !== 'object' || native === null) return null;
  if (Reflect.get(native, 'resourceServer') || Reflect.get(native, 'aud')) return null;
  const parsed = nativeSchema.safeParse({
    kind: Reflect.get(native, 'kind'), clientId: Reflect.get(native, 'clientId'),
    scope: Reflect.get(native, 'scope'), exp: Reflect.get(native, 'exp'),
    isValid: Reflect.get(native, 'isValid'), extra: Reflect.get(native, 'extra'),
  });
  if (!parsed.success || parsed.data.exp <= Date.now() / 1000 ||
      !parsed.data.scope.split(/\s+/).includes(SERVICE_ACCOUNT_INVITE_SCOPE)) return null;
  const identity = parsed.data.extra[SERVICE_ACCOUNT_NAMESPACE];
  const authority = await runDatabaseTransaction(() => requireServiceAccountAuthority(parsed.data.clientId, identity));
  // Authority acquisition can wait on the parent lock. Reject an artifact that expired during that
  // wait so a stale validity result never becomes admission authority.
  if (parsed.data.exp <= Date.now() / 1000) return null;
  return { identity, authority, tokenExpiresAt: parsed.data.exp };
}
