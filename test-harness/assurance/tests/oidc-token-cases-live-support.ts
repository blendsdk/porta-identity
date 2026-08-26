import type { APIResponse } from '@playwright/test';

import { verifyIndependentIdToken } from './protocol-live-jose.js';
import type {
  LiveAuthorizationCode,
  LiveProtocolContext,
  LiveProtocolResponse,
  LiveTokenSet,
} from './protocol-live-http.js';
import type { ProtocolCaseRequirement, ProtocolFactValue } from './oidc-token-cases-contract.js';

/** Sanitized observations retained for one immutable protocol step. */
export interface StepEvidence {
  /** Public facts asserted by the requirement-owned oracle. */
  readonly facts: Readonly<Record<string, ProtocolFactValue>>;
  /** Public HTTP response used for correlated rejection-log observation. */
  readonly response?: LiveProtocolResponse;
  /** Ephemeral values that must be absent from all retained logs. */
  readonly forbiddenValues?: readonly string[];
}

/** Independently verifies an issued ID token against public discovery and JWKS. */
export async function verifyIssuedIdToken(
  context: LiveProtocolContext,
  code: LiveAuthorizationCode,
  tokens: LiveTokenSet | null,
) {
  if (tokens?.id_token === undefined) throw new Error('issued token set omitted the ID token');
  const discovery = await context.discovery(code.tenant);
  return verifyIndependentIdToken(tokens.id_token, await context.jwks(code.tenant), {
    issuer: discovery.issuer,
    audience: code.client.clientId,
    subject: code.subject,
    nonce: code.nonce,
    now: Math.floor(Date.now() / 1000),
  });
}

/** Converts an external HTTP response into bounded public protocol facts. */
export async function sanitizeExternal(
  response: APIResponse,
  context: LiveProtocolContext,
): Promise<LiveProtocolResponse> {
  const contentType = response.headers()['content-type'] ?? '';
  let error: string | null = null;
  if (contentType.includes('json')) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    error = typeof body.error === 'string' ? body.error : null;
  }
  const location = response.headers().location ?? null;
  if (error === null && location !== null) {
    error = new URL(location, context.endpoints.porta).searchParams.get('error');
  }
  return Object.freeze({
    status: response.status(),
    error,
    location,
    requestId: response.headers()['x-request-id'] ?? null,
    response,
  });
}

/** Rejects incomplete live evidence before an immutable case can inspect it. */
export function assertComplete(
  requirement: ProtocolCaseRequirement,
  evidence: ReadonlyMap<string, StepEvidence>,
): void {
  for (const step of [...requirement.controls, ...requirement.probes]) {
    if (!evidence.has(step.id)) throw new Error('live protocol case is incomplete');
  }
}
