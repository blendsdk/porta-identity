# Phase Reviews: T-01

> **CodeOps Artifact Schema**: 1
> **Scope**: strict
> **Last Updated**: 2026-09-27

## Phase 1 — Issue #141: Console callback URI

**Reviewed diff:** `/tmp/opencode/phase1-review.diff` (baseline tree
`975e8befbf987c4f8c0acb21f7b233fda3ebb57f`; product commits `4d024751`, `de05c182`)
**Reviewers:** correctness-reviewer (`RV-*`), security-auditor (`SA-*`, profiles
`auth-protocol` + `owasp-web`), parallel dispatch
**Verify evidence:** targeted unit 11 passed; targeted integration 3 passed; `yarn test:structure`
138 passed; `yarn docs:build` passed; live probe Console URI 303 and unregistered path 400
`invalid_redirect_uri`.

### Security assessment (SA, no critical/major findings)

- The accepted redirect set grows from three to five fixed loopback paths; no new host, scheme,
  scope, grant, or client metadata change.
- Exact path matching plus PKCE (S256) prevents wildcard/open-redirect abuse; a captured local code
  cannot be exchanged without the verifier.
- `/api/admin/metadata` remains intentionally public and returns only `issuer`, `orgSlug`, and the
  public `clientId` (not a credential); no new public disclosure.

### Findings

| ID              | Severity | Dimension / profile       | Location                                                                                            | Problem                                                                                                                                                                                                                                                                                                                                                                                          | Recommended resolution                                                                                                                                                                                                                                                                                                                                                                                            | User decision |
| --------------- | -------- | ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| RV-001 = SA-001 | 🟠 MAJOR | correctness / owasp-web   | `docs/cli/bootstrap.md:52`; plan task T-01.4                                                        | The existing-install tip says to take `<client-id>` from `GET /api/admin/metadata` (`clientId`), but `porta client update` requires the internal UUID (`clientId` is the public OIDC id): `packages/cli/src/commands/client.ts:318-322,349-352`, `packages/server/src/routes/clients.ts:337-350`, `packages/server/src/clients/repository.ts:143-148`. Following the documented fix returns 404. | **Option A (recommended):** docs-only correction — take the internal `ID` from `porta client list` (columns `ID` / `Client ID` at `packages/cli/src/commands/client.ts:240-248`), note that metadata `clientId` is the OIDC login identifier, and align the plan task text. **Option B:** make client routes accept the public `client_id` (larger, outside strict scope, needs its own authorization and tests). | ✅ Resolved — User chose Option A (docs-only correction) |
| RV-002          | 🟡 MINOR | correctness / consistency | `docs/api/authentication.md:13-14`                                                                  | The sequence diagram still shows `{ issuer, authorization_endpoint, token_endpoint }` while the page and implementation now show `{ issuer, orgSlug, clientId }` (`packages/server/src/server.ts:240-244`).                                                                                                                                                                                      | Update the diagram reply and the surrounding wording with the RV-001 docs pass.                                                                                                                                                                                                                                                                                                                                   | ✅ Applied with the RV-001 fix |
| RV-003          | 🟡 MINOR | standards (audit trail)   | `codeops/features/_maintenance/plans/console-callback-version-cleanup/99-execution-plan.md:105-130` | Recorded completion timestamps (20:31–20:39) postdate the commit that contains them (`de05c182` at 20:32), so the audit trail is not faithful.                                                                                                                                                                                                                                                   | Rewrite the marks with the actual times from the verify log mtimes; keep timestamps truthful for the remaining phases.                                                                                                                                                                                                                                                                                            | ✅ Corrected to the recorded verify times |

Reviewer verdicts: no other correctness, maintainability, or standards issues in the touched code,
tests, or docs. The integration test intentionally mirrors the init steps and now pins the DB
value; the provider's native loopback matching was verified against
`node_modules/oidc-provider/lib/models/client.js:444-466`.

**RV-001 ruling (2026-09-27):** the user chose Option A. The existing-install tip now identifies the
client by the internal UUID from `porta client list --app <app-uuid>` and states that the metadata
`clientId` is the public OIDC identifier. RV-002 and RV-003 were applied in the same follow-up
commit. A single scoped re-review runs on the fix diff.
