# Findings: Admin Connected Apps

> **Plan**: `connected-apps/plans/connected-apps-admin`
> **Last Updated**: 2026-11-07

## Review Findings

| ID | Severity | Area | Finding | Ruling |
| --- | --- | --- | --- | --- |
| F1 / SA-1 | CRITICAL / MAJOR | grant identifier | Real provider Grant IDs are 43-character opaque base64url values, not UUIDs; the route and service rejected every real grant. | Fixed: route accepts a bounded provider-shaped identifier; service validates the same shape; production-shaped opaque fixtures cover list and revoke. |
| F2 / SA-2 | MAJOR / MINOR | session authority | Deleting one Grant makes the shared OIDC session fail its live-authority check, so other session-bound apps may require reauthentication. | Accepted and documented: the user/client rows remain, the failure is fail-closed, and the admin-only first surface does not perform Redis session surgery. D5/docs now state the reauthentication consequence. |
| F3 | MAJOR | test fixtures | Fixtures used UUID grant IDs and set the Grant row's `grant_id` to itself, masking F1 and the second delete. | Fixed: grant IDs are opaque; Grant rows use `grant_id NULL`; the revoke test asserts the Grant row and all `grant_id` artifacts are gone; live same-org foreign-user and foreign-org grants cover list isolation. |
| F4 / SA-6 | MINOR | route tests | Route tests call the terminal handler, bypassing auth/permission/membership middleware. | Residual: service tests and middleware suites cover the pieces, but a mounted HTTP 401/403/cross-tenant spec remains for the future Admin UI/SDK surface. |
| F5 / SA-4 | MINOR | list bounds | The list has no explicit cap or supporting JSONB index; admin GET is not rate-limited. | Residual: live grants per user are small in the current model. A cap/index belongs with pagination when a UI surface is added. |
| F6 / SA-5 | MINOR | failure logging | Fixed 503 bodies discarded the underlying failure. | Fixed: the route logs the error name and event without exposing request data. |
| SA-3 | MINOR | audit detail | The generic admin mutation audit lacks target user/client/grant detail. | Residual: the atomic `admin.mutation.committed` row records method/route/actor; a target-specific domain event belongs with a later audit enhancement. |
| F7 | MINOR | docs | DELETE error codes and the session consequence were understated. | Fixed: docs record `400`/`404`/`503`, the opaque grant identifier and the session reauthentication consequence. |

## Verification

| Gate | Result |
| --- | --- |
| Focused integration service | 6 passed |
| Focused route unit | 5 passed |
| Server unit | 4,450 passed |
| Structure / docs build | 158 / passed |
| Server lint / typecheck / build | Passed |
| Independent review | Critical/Major fixed or accepted; minors recorded |
| PR CI / post-merge CI | Pending |
| Production-security assurance | Not required for this admin-only DB surface; CI/security review remain |

## Notes

- No user/client rows are deleted. Revocation is atomic and grant-scoped; access/refresh artifacts
  with the same `grant_id` are removed.
- The Admin-only first surface intentionally excludes end-user self-service, SDK, CLI and terminal
  Admin UI. Those remain a later product decision.
