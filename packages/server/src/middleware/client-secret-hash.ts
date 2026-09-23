/** Confidential-client active-secret bridge for oidc-provider. */

import type { Middleware } from 'koa';

import * as clientCrypto from '../clients/crypto.js';
import { getClientByClientId } from '../clients/service.js';
import {
  findActiveSecretIdBySha256,
  getActiveLegacySecretHashes,
  getLatestActiveSha256,
} from '../clients/secret-repository.js';
import { checkRateLimitStrict } from '../auth/rate-limiter.js';
import { TOKEN_RATE_LIMIT } from './token-rate-limiter.js';

const MAX_CLIENT_ID_LENGTH = 255;
const MAX_SECRET_LENGTH = 512;
const BUSY_RETRY_SECONDS = 1;
let legacyBatchActive = false;

/** Optional controls for the active-secret bridge. */
export interface ClientSecretBridgeOptions {
  /** Credential-free test hook awaited after validation and immediately before provider handoff. */
  afterCredentialValidation?: () => Promise<void>;
}

/** One unambiguous credential parsed from a supported provider representation. */
interface PresentedCredential {
  clientId: string;
  plaintext: string;
  method: 'client_secret_basic' | 'client_secret_post';
  replace(canonicalValue: string): void;
}

/** Identify a plain request-body record without coercing arrays or scalar values. */
function isRequestBody(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Return a parsed object body without coercing arrays or scalar values. */
function requestBody(ctx: Parameters<Middleware>[0]): Record<string, unknown> | undefined {
  const body: unknown = ctx.request.body;
  return isRequestBody(body) ? body : undefined;
}

/** Parse bounded HTTP Basic credentials while leaving malformed input to the provider. */
function basicCredential(ctx: Parameters<Middleware>[0]): PresentedCredential | undefined {
  const authorization = ctx.headers.authorization;
  if (authorization === undefined || !authorization.startsWith('Basic ')) return undefined;
  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const clientId = decoded.slice(0, separator);
    const plaintext = decoded.slice(separator + 1);
    if (
      separator < 1 ||
      clientId.length > MAX_CLIENT_ID_LENGTH ||
      plaintext.length < 1 ||
      plaintext.length > MAX_SECRET_LENGTH
    ) {
      return undefined;
    }
    return {
      clientId,
      plaintext,
      method: 'client_secret_basic',
      replace(canonicalValue) {
        const encoded = Buffer.from(`${clientId}:${canonicalValue}`).toString('base64');
        ctx.headers.authorization = `Basic ${encoded}`;
        ctx.req.headers.authorization = `Basic ${encoded}`;
      },
    };
  } catch {
    return undefined;
  }
}

/** Parse bounded form credentials from the body already parsed by the OIDC router. */
function postCredential(ctx: Parameters<Middleware>[0]): PresentedCredential | undefined {
  const body = requestBody(ctx);
  const clientId = body?.client_id;
  const plaintext = body?.client_secret;
  if (
    body === undefined ||
    typeof clientId !== 'string' ||
    clientId.length < 1 ||
    clientId.length > MAX_CLIENT_ID_LENGTH ||
    typeof plaintext !== 'string' ||
    plaintext.length < 1 ||
    plaintext.length > MAX_SECRET_LENGTH
  ) {
    return undefined;
  }
  const mutableBody = body;
  return {
    clientId,
    plaintext,
    method: 'client_secret_post',
    replace(canonicalValue) {
      mutableBody.client_secret = canonicalValue;
      const rawBody: unknown = Reflect.get(ctx.req, 'body');
      if (typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)) {
        Reflect.set(rawBody, 'client_secret', canonicalValue);
      }
    },
  };
}

/** Return one supported credential source and reject ambiguous dual-mechanism input. */
function presentedCredential(ctx: Parameters<Middleware>[0]): PresentedCredential | undefined {
  const basic = basicCredential(ctx);
  const post = postCredential(ctx);
  if (basic !== undefined && post !== undefined) return undefined;
  return basic ?? post;
}

/** Return the resolved tenant identifier without trusting request-controlled text. */
function organizationId(ctx: Parameters<Middleware>[0]): string | undefined {
  const organization: unknown = ctx.state?.organization;
  if (typeof organization !== 'object' || organization === null || Array.isArray(organization)) {
    return undefined;
  }
  const id: unknown = Reflect.get(organization, 'id');
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** Emit the existing fixed token rate-limit response without credential detail. */
function denyProtectedWork(ctx: Parameters<Middleware>[0], retryAfter: number): void {
  ctx.status = 429;
  ctx.set('Retry-After', String(retryAfter));
  ctx.body = {
    error: 'rate_limit_exceeded',
    error_description: 'Too many token requests. Please try again later.',
    retry_after: retryAfter,
  };
}

/** Rewrite a proven credential and continue to oidc-provider. */
async function handOffValidatedCredential(
  credential: PresentedCredential,
  canonicalValue: string,
  options: ClientSecretBridgeOptions,
  next: Parameters<Middleware>[1],
): Promise<void> {
  credential.replace(canonicalValue);
  await options.afterCredentialValidation?.();
  await next();
}

/**
 * Create the bounded active-secret bridge mounted immediately before oidc-provider.
 *
 * @param options - Optional credential-free validation/handoff test hook
 * @returns Koa middleware
 */
export function clientSecretHash(options: ClientSecretBridgeOptions = {}): Middleware {
  return async (ctx, next) => {
    const credential = presentedCredential(ctx);
    const tenantId = organizationId(ctx);
    if (credential === undefined || tenantId === undefined) return next();

    try {
      const client = await getClientByClientId(credential.clientId);
      if (
        client === null ||
        client.organizationId !== tenantId ||
        client.clientType !== 'confidential' ||
        client.status !== 'active' ||
        client.tokenEndpointAuthMethod !== credential.method
      ) {
        return next();
      }

      const canonicalValue = await getLatestActiveSha256(client.id);
      if (canonicalValue === null) return next();

      const presentedSha256 = clientCrypto.sha256Secret(credential.plaintext);
      const modernMatchId = await findActiveSecretIdBySha256(client.id, presentedSha256);
      if (modernMatchId !== null) {
        return handOffValidatedCredential(
          credential,
          canonicalValue,
          options,
          next,
        );
      }

      const legacySecrets = await getActiveLegacySecretHashes(client.id);
      if (legacySecrets.length === 0 || legacySecrets.length > 10) return next();
      if (legacyBatchActive) {
        denyProtectedWork(ctx, BUSY_RETRY_SECONDS);
        return;
      }

      legacyBatchActive = true;
      let legacyMatched = false;
      try {
        const limit = await checkRateLimitStrict(
          `ratelimit:client-secret-legacy:${tenantId}:${client.id}`,
          TOKEN_RATE_LIMIT,
        );
        if (!limit.allowed) {
          denyProtectedWork(ctx, limit.retryAfter);
          return;
        }

        for (const legacy of legacySecrets) {
          if (await clientCrypto.verifySecretHash(legacy.hash, credential.plaintext)) {
            legacyMatched = true;
            break;
          }
        }
      } finally {
        legacyBatchActive = false;
      }
      if (legacyMatched) {
        return handOffValidatedCredential(credential, canonicalValue, options, next);
      }
    } catch {
      // Fail closed by leaving the credential untouched for the provider's minimal rejection.
    }
    return next();
  };
}
