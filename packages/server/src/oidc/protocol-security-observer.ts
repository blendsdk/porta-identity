import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type Provider from 'oidc-provider';
import type { KoaContextWithOIDC } from 'oidc-provider';
import { logger } from '../lib/logger.js';

const MAX_CLIENT_ID_LENGTH = 255;
const CLIENT_ID_DIGEST_DOMAIN = 'porta:oidc-client-id:v1\0';

const requestCorrelations = new WeakMap<IncomingMessage, string>();
const observedClasses = new WeakMap<IncomingMessage, Set<ProtocolSecurityEventClass>>();

/** Stable categories for rejected requests at public OIDC protocol boundaries. */
export type ProtocolSecurityEventClass =
  | 'authorization-rejected'
  | 'token-grant-rejected'
  | 'userinfo-rejected'
  | 'end-session-rejected'
  | 'introspection-rejected'
  | 'revocation-rejected'
  | 'client-tenant-binding-rejected'
  | 'interaction-context-rejected';

/** Minimal input accepted by the privacy-safe protocol rejection observer. */
export interface ProtocolSecurityRejectionInput {
  /** Raw request shared by the outer Koa application and the OIDC provider. */
  request: IncomingMessage;
  /** Stable location-oriented rejection category. */
  eventClass: ProtocolSecurityEventClass;
  /** Public client identifier when the rejecting boundary has already parsed one. */
  clientId?: string;
}

/**
 * Associates a server-generated request identifier with the raw request object.
 *
 * A weak association lets the nested OIDC provider retrieve the identifier without copying
 * request-controlled headers or retaining request state after Node releases the request.
 */
export function registerProtocolRequestCorrelation(
  request: IncomingMessage,
  requestId: string,
): void {
  requestCorrelations.set(request, requestId);
}

/**
 * Produces a stable one-way representation of a bounded public client identifier.
 *
 * The domain separator prevents the digest from being confused with hashes used for a different
 * purpose. Missing or malformed identifiers remain `null`; the observer never invents an ID.
 */
export function digestProtocolClientId(clientId: unknown): string | null {
  if (
    typeof clientId !== 'string' ||
    clientId.length === 0 ||
    clientId.length > MAX_CLIENT_ID_LENGTH
  ) {
    return null;
  }

  return createHash('sha256').update(CLIENT_ID_DIGEST_DOMAIN).update(clientId).digest('hex');
}

/**
 * Emits one bounded, privacy-safe security-rejection event per request and category.
 *
 * Observation is deliberately best-effort: missing correlation suppresses the event, and logging
 * never performs I/O or changes the protocol response. Error objects, request parameters, and raw
 * identifiers are intentionally outside this API.
 */
export function observeProtocolSecurityRejection(input: ProtocolSecurityRejectionInput): void {
  const requestId = requestCorrelations.get(input.request);
  if (requestId === undefined) return;

  const previous = observedClasses.get(input.request) ?? new Set<ProtocolSecurityEventClass>();
  if (previous.has(input.eventClass)) return;
  previous.add(input.eventClass);
  observedClasses.set(input.request, previous);

  try {
    logger.warn(
      {
        event: 'protocol-security-rejection',
        'synthetic-correlation-id': requestId,
        'event-class': input.eventClass,
        'public-client-id-digest': digestProtocolClientId(input.clientId),
      },
      'protocol-security-rejection',
    );
  } catch {
    // Security observation must never change the protocol response or create a secondary failure.
  }
}

function clientIdFromProviderContext(context: KoaContextWithOIDC): string | undefined {
  const resolvedClientId = context.oidc.client?.clientId;
  if (typeof resolvedClientId === 'string') return resolvedClientId;

  const parameterClientId = context.oidc.params?.client_id;
  return typeof parameterClientId === 'string' ? parameterClientId : undefined;
}

function observeProviderRejection(
  context: KoaContextWithOIDC,
  eventClass: ProtocolSecurityEventClass,
): void {
  observeProtocolSecurityRejection({
    request: context.req,
    eventClass,
    clientId: clientIdFromProviderContext(context),
  });
}

/** Registers the enabled provider rejection events covered by Porta's protocol assurance. */
export function registerProtocolSecurityObservers(provider: Provider): void {
  provider.on('authorization.error', (context) => {
    observeProviderRejection(context, 'authorization-rejected');
  });
  provider.on('grant.error', (context) => {
    observeProviderRejection(context, 'token-grant-rejected');
  });
  provider.on('userinfo.error', (context) => {
    observeProviderRejection(context, 'userinfo-rejected');
  });
  provider.on('end_session.error', (context) => {
    observeProviderRejection(context, 'end-session-rejected');
  });
  provider.on('introspection.error', (context) => {
    observeProviderRejection(context, 'introspection-rejected');
  });
  provider.on('revocation.error', (context) => {
    observeProviderRejection(context, 'revocation-rejected');
  });
}
