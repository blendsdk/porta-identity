/**
 * ETag generation and optimistic concurrency control utility.
 *
 * Provides ETag generation from entity metadata and If-Match header
 * validation for optimistic concurrency on PUT/PATCH endpoints.
 *
 * ETags use MD5 hashing of entity type + ID + updatedAt timestamp.
 * MD5 is used for speed, not security — ETags are not secrets, they
 * are cache/concurrency markers. Weak ETags (W/"...") are used since
 * the comparison is semantic equivalence, not byte-identical content.
 *
 * Integration pattern:
 *   GET /:id  → setETagHeader(ctx, 'entity', id, updatedAt)
 *   PUT /:id  → checkIfMatch(ctx, 'entity', id, current.updatedAt, current)
 *
 * @module lib/etag
 */

import { createHash } from 'node:crypto';

// ============================================================================
// ETag Generation
// ============================================================================

/**
 * Generate a weak ETag from entity type, ID, and updatedAt timestamp.
 *
 * The ETag is a deterministic MD5 hash of the concatenation:
 *   `${entityType}:${id}:${updatedAt.toISOString()}`
 *
 * Format: `W/"<first 16 hex chars of MD5>"` (weak ETag, 64-bit precision)
 *
 * @param entityType - Entity type string (e.g., 'organization', 'user')
 * @param id - Entity UUID
 * @param updatedAt - Entity's last modification timestamp
 * @returns Weak ETag string (e.g., `W/"a1b2c3d4e5f67890"`)
 */
export function generateETag(entityType: string, id: string, updatedAt: Date): string {
  const input = `${entityType}:${id}:${updatedAt.toISOString()}`;
  const hash = createHash('md5').update(input).digest('hex').substring(0, 16);
  return `W/"${hash}"`;
}

// ============================================================================
// ETag Comparison
// ============================================================================

/**
 * Compare an If-Match header value against the current ETag.
 *
 * Returns true if the ETags match (safe to proceed with the update).
 * Handles:
 * - Quoted strings: `"abc"` matches `W/"abc"` and vice versa
 * - Weak prefix: `W/"abc"` is treated equivalently to `"abc"` for weak comparison
 * - Wildcard: `*` always matches
 * - Multiple ETags: `"abc", "def"` matches if any one matches
 *
 * @param ifMatchHeader - The value of the If-Match HTTP header
 * @param currentETag - The current entity's ETag
 * @returns true if they match
 */
export function matchesETag(ifMatchHeader: string, currentETag: string): boolean {
  const trimmed = ifMatchHeader.trim();

  // Wildcard matches everything
  if (trimmed === '*') {
    return true;
  }

  // Extract the hash portion from the current ETag for comparison
  const currentHash = extractHash(currentETag);
  if (!currentHash) {
    return false;
  }

  // Split on comma for multiple ETags: If-Match: "a", "b", "c"
  const candidates = trimmed.split(',').map((s) => s.trim());

  return candidates.some((candidate) => {
    const candidateHash = extractHash(candidate);
    return candidateHash !== null && candidateHash === currentHash;
  });
}

/**
 * Extract the raw hash string from an ETag value.
 *
 * Strips the W/ prefix and surrounding quotes:
 *   `W/"abc123"` → `abc123`
 *   `"abc123"`   → `abc123`
 *   `abc123`     → `abc123`
 *
 * @param etag - ETag value (possibly with W/ prefix and quotes)
 * @returns The raw hash string, or null if empty/invalid
 */
function extractHash(etag: string): string | null {
  let value = etag.trim();

  // Remove weak prefix
  if (value.startsWith('W/')) {
    value = value.substring(2);
  }

  // Remove surrounding quotes
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.substring(1, value.length - 1);
  }

  return value.length > 0 ? value : null;
}

// ============================================================================
// Koa Integration Helpers
// ============================================================================

/**
 * Context-like interface for Koa — avoids importing Koa types in a utility module.
 */
interface ETagContext {
  set: (field: string, value: string) => void;
  get: (field: string) => string;
  status: number;
  body: unknown;
}

/**
 * Set the ETag header on a GET response.
 *
 * Call this in GET-single-entity handlers after retrieving the entity:
 * ```typescript
 * const org = await getOrganization(id);
 * setETagHeader(ctx, 'organization', id, org.updatedAt);
 * ctx.body = { data: org };
 * ```
 *
 * @param ctx - Koa context (or compatible object with set/get methods)
 * @param entityType - Entity type string (e.g., 'organization')
 * @param id - Entity UUID
 * @param updatedAt - Entity's last modification timestamp
 */
export function setETagHeader(ctx: ETagContext, entityType: string, id: string, updatedAt: Date): void {
  const etag = generateETag(entityType, id, updatedAt);
  ctx.set('ETag', etag);
}

/**
 * Check the If-Match header on a PUT/PATCH request.
 *
 * If the If-Match header is present and does NOT match the current entity's
 * ETag, sets a 409 Conflict response with the current entity state and
 * returns false (caller should `return` without proceeding).
 *
 * If the header is absent or matches, returns true (safe to proceed).
 * This makes If-Match opt-in — backward compatible with clients that
 * don't send it.
 *
 * @param ctx - Koa context
 * @param entityType - Entity type string
 * @param id - Entity UUID
 * @param updatedAt - Entity's current updatedAt timestamp
 * @param currentEntity - The current entity (included in 409 response body)
 * @returns true if the update may proceed, false if 409 was sent
 */
export function checkIfMatch(
  ctx: ETagContext,
  entityType: string,
  id: string,
  updatedAt: Date,
  currentEntity: unknown,
): boolean {
  const ifMatchHeader = ctx.get('If-Match');
  if (!ifMatchHeader) {
    // No If-Match header — backward compatible, proceed without check
    return true;
  }

  const currentETag = generateETag(entityType, id, updatedAt);

  if (matchesETag(ifMatchHeader, currentETag)) {
    return true;
  }

  // Conflict — entity was modified since the client's last read
  ctx.status = 409;
  ctx.body = {
    error: 'Conflict',
    message: 'Entity has been modified since your last read. Please refresh and try again.',
    currentEntity,
    currentETag,
  };
  return false;
}
