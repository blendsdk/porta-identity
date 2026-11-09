/**
 * Resource-server Admin projections and inputs.
 *
 * These types describe the management surface only. The provider resolver in
 * `../oidc/resource-servers.ts` remains the consumer of the persisted rows.
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
  /** Optional slug; derived from the name when omitted. */
  readonly slug?: string;
  /** Exact RFC 8707 resource identifier. */
  readonly identifier: string;
  /** Optional access-token audience; defaults to the identifier. */
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
  /** Optional access-token audience; omitted means the identifier. */
  readonly audience?: string | null;
  /** Complete custom scope registry; omitted means empty. */
  readonly scopes?: readonly string[];
}

/** Normalized data handed to the repository. */
export interface NormalizedResourceServerInput {
  readonly name: string;
  readonly slug: string;
  readonly identifier: string;
  readonly audience: string;
  readonly scopes: readonly string[];
}

/** Raw resource-server row with the aggregated scope registry. */
export interface ResourceServerRow {
  readonly id: string;
  readonly application_id: string;
  readonly slug: string;
  readonly name: string;
  readonly identifier: string;
  readonly audience: string;
  readonly scopes: string[] | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Map one database row to the public projection.
 *
 * @param row - Row returned by the repository query.
 * @returns Resource server with ISO timestamps and a sorted unique scope array.
 */
export function mapResourceServerRow(row: ResourceServerRow): ResourceServer {
  return Object.freeze({
    id: row.id,
    applicationId: row.application_id,
    slug: row.slug,
    name: row.name,
    identifier: row.identifier,
    audience: row.audience,
    scopes: Object.freeze([...new Set(row.scopes ?? [])].sort()),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
