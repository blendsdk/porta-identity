/**
 * Resource-server entity and input types for the Porta SDK.
 *
 * @module types/resource-servers
 */

/** One application-owned resource server returned by the Admin API. */
export interface ResourceServer {
  /** Internal resource-server UUID. */
  readonly id: string;
  /** Internal UUID of the owning application. */
  readonly applicationId: string;
  /** Stable slug within the owning application. */
  readonly slug: string;
  /** Human-readable name. */
  readonly name: string;
  /** Exact RFC 8707 resource identifier. */
  readonly identifier: string;
  /** Access-token audience; defaults to the identifier. */
  readonly audience: string;
  /** Sorted custom scope registry. */
  readonly scopes: readonly string[];
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO-8601 last-change timestamp. */
  readonly updatedAt: string;
}

/** Accepted create input. */
export interface CreateResourceServerInput {
  /** Human-readable name. */
  readonly name: string;
  /** Optional slug; the server derives one from the name when omitted. */
  readonly slug?: string;
  /** Exact RFC 8707 resource identifier. */
  readonly identifier: string;
  /** Optional audience; omitted or null means the identifier. */
  readonly audience?: string | null;
  /** Optional custom scopes. */
  readonly scopes?: readonly string[];
}

/** Accepted full-replacement update input. */
export interface UpdateResourceServerInput {
  /** Human-readable name. */
  readonly name: string;
  /** Stable slug within the application. */
  readonly slug: string;
  /** Exact RFC 8707 resource identifier. */
  readonly identifier: string;
  /** Optional audience; omitted or null resets to the identifier. */
  readonly audience?: string | null;
  /** Complete custom scope registry; omitted means empty. */
  readonly scopes?: readonly string[];
}
