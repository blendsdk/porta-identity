# Tenant API and SDK

> **Parent**: [Index](00-index.md)
> **Authority**: AR #1, #2, #6, #8, #9

## HTTP

Create `packages/server/src/routes/tenant-invitations.ts`, exporting `createTenantInvitationsRouter(provider?: TenantTokenProvider): Router`, prefix `/api/organizations/:orgId/invitations`, with exactly `DELETE /:invitationId`. Mount in `server.ts` beside the tenant-user router using its provider; do not add any admin endpoint (AR #1/#9).

Order: existing `requireTenantActorAuth` with actor kinds `['service','user']`, `TENANT_INVITE_SCOPE` and `TENANT_INVITE_PERMISSION`; existing `tenantUserDeleteRateLimiter`; Zod UUID validation of route ids; service call using authenticated actor org/app and `tenantActorToAuditActor`. Missing actor fails closed. Use existing `handleUserRouteError` for Zod errors; unknown failures reach global `errorHandler`. Use trusted IP/user-agent through existing audit fields (AR #8/#9).

| Outcome | HTTP result | Authority |
| --- | --- | --- |
| Actual revoke or eligible no-op | 204, empty body, no result/existence classification | AR #6/#8 |
| Malformed org/id reaching validation | 400 `{error:'User request is invalid'}` | AR #8 |
| Missing/invalid bearer | Existing 401 body | AR #2/#8 |
| Wrong route organization, control-plane, missing scope/permission | Existing 403 body | AR #2/#8 |
| Existing strict rate budget exhausted | Existing 429 and Retry-After | AR #8 |
| Rate-limit Redis unavailable | Existing 503 | AR #8 |
| Transaction or audit failure | Existing sanitized global 500, never 204 | AR #6 |

For malformed organization IDs rejected first by authentication, preserve that denial rather than disclose organization existence. Cross-application target UUIDs are silent no-ops; this is distinct from an actor failing organization authentication. GET or other unsupported methods gain no invitation read capability.

## SDK

Export `RevokeInvitationInput` from `packages/sdk/src/types/users.ts` through existing `types/index.ts`, properties `organizationId: string` and `invitationId: string`. Add `UsersDomain.revokeInvitation(input: RevokeInvitationInput): Promise<void>` and implementation in existing users domain. Path is `/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationId)}`, method DELETE, no body. Await `transport.request` and do not unwrap a 204 body. No new transport/domain, token acquisition, retry, Admin API counterpart or dependency (AR #1/#9).

Document tenant-only use with `NodeTransport` configured `apiPrefix:'/api'`. Default admin prefix must not provide revocation authority; no automatic prefix override. Standard transport errors propagate unchanged. UUID validation remains authoritative on the server (AR #9).

Required compatibility-only edits (PF-001/PF-002/PF-006): register the new SDK type specification in the existing `packages/sdk/tests/type-contracts/tsconfig.json`; add an unused revoke method stub to `packages/cli/tests/admin/session-wiring.impl.test.ts`'s complete UsersDomain fixture; reconcile actual server/SDK test inventories in `repo-tests/monorepo/server-package.spec.test.mjs` while retaining exact assertions. This does not authorize CLI production behavior or broader test-infrastructure changes.

## Documentation

Update `docs/api/users.md`, `docs/guide/sdk-node.md` and `packages/sdk/README.md` for API/SDK examples and required invitation authority. Explain saving the returned invitation id, normal no-op semantics, legacy/admin limitation, application sharing, accepted-account behavior, no notification, shared strict limit and audit-failure errors. Update existing maintainer `techdocs/architecture/security.md` and `techdocs/architecture/data-model.md` plus migration guidance for storage/rollout in 03-01; do not create a generalized new doc set (AR #9).
