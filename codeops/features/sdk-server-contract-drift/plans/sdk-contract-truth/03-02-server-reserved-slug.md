# Server Reserved Slug `new`: SDK–Server Contract Truth

> **Document**: 03-02-server-reserved-slug.md
> **Parent**: [Index](00-index.md)
> **Implements**: RD-01 R9

## Overview

Reserve the slug `new`, a conventional create-action segment that reserved system or future static
routes can claim. The change is validation-only: no schema change, no data migration, and no
route change.

## Architecture

### Current Architecture

`RESERVED_SLUGS` (`packages/server/src/organizations/slugs.ts:24-54`) lists system routes, auth
paths, application paths, and well-known files. `validateSlug` checks format first, then
membership in the set (`:129-156`). `organizationSlugSchema` wraps that check for the API
(`packages/server/src/organizations/validators.ts:15-17`), so create and validate-slug requests
already answer `400` for reserved words.

### Proposed Changes

Add `'new'` to the "Application paths" group with a short comment explaining that `new` is a
reserved create-action segment. The docs note in `docs/api/organizations.md` records the word, the
UUID access path for an existing tenant, and the direct database slug change (no Admin API rename
exists).

## Implementation Details

### Changed Constant

```typescript
// Application paths
'portal',
'dashboard',
'settings',
'account',
'new', // Reserved create-action segment
```

No other code path changes. The same set already governs slug validation, create, and update
through `organizationSlugSchema`.

### Integration Points

- `GET /api/admin/organizations/validate-slug` answers `400` for `new`.
- `POST /api/admin/organizations` with `slug: 'new'` answers `400`.
- An existing organization already using the slug `new` keeps its data and remains reachable by
  UUID. No Admin API slug rename exists (`routes/organizations.ts:70-75`,
  `organizations/repository.ts:185-196`); the operator note documents UUID access and a direct
  database slug change.

## Code Examples

```http
GET /api/admin/organizations/validate-slug?slug=new
→ 400 { error: 'Organization request is invalid' }
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| `new` submitted as a slug | Zod refinement fails; route answers `400` with the existing fixed message | AR-11 |
| Existing tenant with slug `new` | Untouched data; UUID access; documented direct database slug change; portability manifests need a slug edit on import | AR-11 |
| Similar slugs (`new-york`, `renew`) | Unaffected — only the exact word is reserved | AR-11 |

> **Traceability:** every error-handling strategy references the Ambiguity Register entry that
> resolved it. See `00-ambiguity-register.md`.

## Testing Requirements

- Unit (`packages/server/tests/unit/organizations/slugs.test.ts`): `validateSlug('new')` returns
  `{ isValid: false }` with an error naming the reservation (ST-4); update the expected word list
  and the `RESERVED_SLUGS.size` assertion from 22 to 23.
- Regression: previously valid slugs such as `new-york` still validate (ST-5).
