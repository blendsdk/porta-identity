# SDK Organizations Domain: SDK–Server Contract Truth

> **Document**: 03-03-sdk-organizations.md
> **Parent**: [Index](00-index.md)
> **Implements**: RD-01 R1–R4 (organization and shared-parameter parts)

## Overview

Correct the organization domain and the shared list/history parameter types so the SDK matches the
server's slug-validation result, sort parameter names, history envelope, and update ETag.

## Architecture

### Current Architecture

- `SlugValidation { available, slug }` is cast from the response body
  (`packages/sdk/src/domains/organizations.ts:20-23,84-87`); the server sends `{ isValid, error? }`.
- `ListParams.sort` / `order` (`packages/sdk/src/types/common.ts:23-26`) do not match the server's
  `sortBy` / `sortOrder`.
- `getHistory` returns `HistoryEntry[]` via `unwrapData`
  (`packages/sdk/src/domains/organizations.ts:89-96`), dropping `hasMore` / `nextCursor`.
- `update` returns `Organization` (`:62-70`), dropping the response ETag.

### Proposed Changes

- Replace the `SlugValidation` interface with `SlugValidationResult` in the new
  `packages/sdk/src/types/organizations.ts` home (moved out of the domain module so consumers can
  import it from `@portaidentity/sdk` like every other type).
- Rename the shared sort fields; add a shared `HistoryParams` type.
- Change `update` and `getHistory` return types and unwrapping.

## Implementation Details

### New Types/Interfaces

`packages/sdk/src/types/common.ts`:

```typescript
/**
 * Standard paginated list parameters accepted by `list()` methods.
 *
 * Sort field names mirror the Admin API (`sortBy`, `sortOrder`). The server
 * ignores unknown parameter names, so a misspelled sort silently falls back to
 * the resource default.
 */
export interface ListParams {
  /** Page number (1-based, offset pagination) */
  page?: number;
  /** Items per page (default: 20, max: 100) */
  pageSize?: number;
  /** Cursor for keyset pagination (alternative to page) */
  cursor?: string;
  /** Search query (searches name/email/slug depending on entity) */
  search?: string;
  /** Sort field (entity-specific) */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Additional filter parameters */
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Cursor pagination parameters accepted by entity history endpoints.
 *
 * The server reads `limit`, `after`, and `event_type`; the SDK exposes the
 * third as `eventType` and performs the mapping. The `after` cursor is opaque:
 * an invalid value surfaces as a `PortaServerError`; the SDK does not decode
 * or validate it.
 */
export interface HistoryParams {
  /** Maximum entries returned in one page (server default applies when omitted) */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor` */
  after?: string;
  /** Event-type prefix filter (for example `user.` for all user events) */
  eventType?: string;
}
```

`packages/sdk/src/types/organizations.ts`:

```typescript
/**
 * Result of checking whether a slug can be assigned to an organization.
 *
 * A malformed or reserved slug is rejected with HTTP 400 before this result is
 * produced; a well-formed but taken slug returns `isValid: false` with an error
 * message.
 */
export interface SlugValidationResult {
  /** Whether the slug passes format, reserved-word, and uniqueness checks */
  isValid: boolean;
  /** Human-readable reason when `isValid` is false */
  error?: string;
}
```

Both types are exported from `packages/sdk/src/types/index.ts`.

### New Functions/Methods

`packages/sdk/src/domains/organizations.ts` interface changes:

```typescript
update(
  idOrSlug: string,
  input: UpdateOrganizationInput,
  etag?: string,
): Promise<ETagResponse<Organization>>;

validateSlug(slug: string): Promise<SlugValidationResult>;

getHistory(idOrSlug: string, params?: HistoryParams): Promise<HistoryResult>;
```

Implementation notes:

- `update` uses `unwrapWithEtag<Organization>(res)` — the helper already exists.
- `validateSlug` returns `res.body as SlugValidationResult`; the transport maps `400` to
  `PortaValidationError`, so no extra branching is added.
- `getHistory` sends `{ limit, after, event_type }` derived from `HistoryParams` and returns
  `res.body as HistoryResult` (the route sends the envelope unwrapped).

### Integration Points

- `HistoryParams` and `SlugValidationResult` are re-exported by `types/index.ts`; `HistoryResult`
  already is.
- `listAll` and other list callers continue to use `ListParams`. The retained string index
  signature means legacy `sort`/`order` callers still compile and those parameters remain
  forwarded and ignored by the server; the corrected field names and JSDoc are the migration
  prompt, and no runtime enforcement is claimed.
- The CLI and agent catalog use `HistoryResult` for user history; organizations history is a
  return-type change only (03-05 tracks the shared contract).

## Code Examples

### Slug validation with the server's error text

```typescript
const result = await porta.organizations.validateSlug('acme-corp');
if (!result.isValid) {
  console.error(result.error); // e.g. "Slug already in use"
}
```

### ETag round-trip without a re-read

```typescript
const { data: org, etag } = await porta.organizations.update(orgId, { name: 'Renamed' }, before);
await porta.organizations.update(orgId, { name: 'Renamed again' }, etag!);
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| Malformed or reserved slug | Transport maps `400` to `PortaValidationError`; documented in JSDoc | AR-2 |
| Taken slug | Returns `{ isValid: false, error }` with HTTP 200 | AR-2 |
| Unknown sort field | Server falls back to the resource default; correct names documented | AR-3 |
| Stale `If-Match` on update | Existing `409` → `PortaConflictError`; unchanged | AR-5 |
| History page without a cursor | `nextCursor: null`; loop terminates | AR-4 |
| Malformed `after` cursor | Server-side cursor decode fails and surfaces as `PortaServerError`; the cursor is documented as opaque | AR-4 |

> **Traceability:** every error-handling strategy references the Ambiguity Register entry that
> resolved it. See `00-ambiguity-register.md`.

## Testing Requirements

- Spec tests in `packages/sdk/tests/domains/organizations.test.ts` covering ST-6–ST-10. Runtime
  cases that already pass pre-change (ST-6/ST-8) are reclassified, and the red evidence for the
  type-level defects comes from exact-type oracles in `packages/sdk/tests/type-contracts/`
  (`SlugValidationResult`, `ListParams` keys).
- The exact-key oracles for `ListParams` and `HistoryParams` are added to a file that is listed in
  `packages/sdk/tests/type-contracts/tsconfig.json`.
