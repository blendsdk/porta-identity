import type { IncomingMessage } from 'node:http';

/** Request-only evidence of the exact credential validated before canonical digest rewriting. */
export interface ServiceAccountCredentialProof {
  /** Internal parent client UUID. */
  readonly clientId: string;
  /** Public OAuth identifier authenticated by the bridge. */
  readonly publicClientId: string;
  /** Organization resolved by the real tenant middleware. */
  readonly organizationId: string;
  /** Exact modern or legacy credential row, never its digest or plaintext. */
  readonly secretId: string;
}

/** A raw request survives the provider's creation of its own Koa context; contexts do not. */
const proofs = new WeakMap<IncomingMessage, ServiceAccountCredentialProof>();

/**
 * Attach trusted bridge evidence before handing the same raw request to the provider.
 *
 * @param request - Original IncomingMessage, shared by outer middleware and the provider.
 * @param proof - Non-secret row identities obtained only after genuine credential verification.
 */
export function setServiceAccountCredentialProof(
  request: IncomingMessage, proof: ServiceAccountCredentialProof,
): void {
  proofs.set(request, Object.freeze({ ...proof }));
}

/**
 * Read request-local evidence; caller-supplied headers and form fields are never consulted.
 * @returns The immutable verification evidence, or undefined when no bridge proof exists.
 */
export function getServiceAccountCredentialProof(
  request: IncomingMessage,
): ServiceAccountCredentialProof | undefined {
  return proofs.get(request);
}
