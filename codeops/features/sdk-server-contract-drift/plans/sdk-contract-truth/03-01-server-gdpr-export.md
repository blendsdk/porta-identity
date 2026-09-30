# Server GDPR Export and User-Create ETag: SDK–Server Contract Truth

> **Document**: 03-01-server-gdpr-export.md
> **Parent**: [Index](00-index.md)
> **Implements**: RD-02; RD-01 R4 (user-create ETag only)

## Overview

This component repairs the GDPR user export query and closes one small server gap that the ETag
requirement depends on: the user-create route must emit the `ETag` header that every other user
write path already emits.

The export fix is behavior-preserving apart from making the endpoint work: the document shape,
ordering, and authorization are unchanged. The create-ETag addition reuses the existing
`setETagHeader` helper.

## Architecture

### Current Architecture

`exportUserData(user)` runs five parallel parameterized queries (`packages/server/src/users/gdpr.ts:87-147`):
organization, roles, custom claims, audit log, and OIDC session count. The custom-claim query names
tables that do not exist. The route
(`packages/server/src/routes/users.ts:400-411`) calls the service and wraps the document in
`{ data }` without a `try/catch`, so the database error reaches the global middleware and the
client sees `500`.

The user-create route (`packages/server/src/routes/users.ts:220-232`) returns `{ data: user }` with
no ETag, while the update handlers set one at `:301` and `:805`.

### Proposed Changes

- Rewrite the custom-claim query to the real schema:
  `custom_claim_values ucv JOIN custom_claim_definitions ccd ON ccd.id = ucv.claim_id`.
- Add `setETagHeader(ctx, 'user', user.id, user.updatedAt)` to the create handler between
  `createUser` and the response assignment.
- Do not add a `try/catch` to the export route; its sibling failure contract is already handled by
  the global error middleware, and a unit test pins the service-layer failure path (AR-1, RD-02 R4).

## Implementation Details

### Changed Query

```sql
SELECT ccd.claim_name, ucv.value, ccd.application_id
FROM custom_claim_values ucv
JOIN custom_claim_definitions ccd ON ccd.id = ucv.claim_id
WHERE ucv.user_id = $1
ORDER BY ccd.claim_name
```

The row-to-document mapping is unchanged (`packages/server/src/users/gdpr.ts:179-183`):
`claim_name` → `claimName`, `value` → `value`, `application_id` → `applicationId`.

### Changed Handler

```typescript
const user = await userService.createUser({ organizationId: ctx.params.orgId, ...body });
setETagHeader(ctx, 'user', user.id, user.updatedAt);
ctx.status = 201;
ctx.body = { data: user };
```

The header is derived from the same `updatedAt` the `GET` and `PUT` handlers use, so the value a
caller reads after create matches a subsequent `If-Match` check.

### Integration Points

- The route's authorization (`admin:user:read` plus `requireUserOrganization()`) is untouched.
- The SDK's `users.create` and `users.update` return `ETagResponse<User>` per 03-04, consuming this
  header through the existing `unwrapWithEtag` helper.
- The `UserDataExport` document feeds the SDK's mirrored type (03-04 R8).

## Code Examples

### Verify the export against a migrated database

```typescript
const user = await createTestUser(org.id, { email: 'claims@example.test' });
await upsertValue(user.id, definition.id, 'engineering');
const result = await exportUserData(user);
expect(result.customClaims).toEqual([
  { claimName: definition.claimName, value: 'engineering', applicationId: app.id },
]);
```

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| Invalid user ID | Route answers `404` before calling the service (unchanged) | AR-1 |
| Database failure | Reaches global middleware as today; the service contract is unchanged | AR-1 |
| User without claims | Query returns zero rows; `customClaims: []` | AR-1 |

> **Traceability:** every error-handling strategy references the Ambiguity Register entry that
> resolved it. See `00-ambiguity-register.md`.

## Testing Requirements

- Integration (real schema): user with claim values → populated `customClaims` (ST-1); user
  without → `[]` (ST-2); route-level `200` for both (ST-3), following the router pattern in
  `tests/integration/admin/system-config-api.spec.test.ts`.
- Unit: the mapping tests stay passing and a new failure-path case asserts that a rejecting pool
  propagates the error (RD-02 R4).
- Integration: create response carries an `ETag` whose value matches a subsequent `If-Match`
  update (ST-24).
