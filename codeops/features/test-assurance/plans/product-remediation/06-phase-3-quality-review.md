# Phase 3 Quality Review

> **Date**: 2026-08-22
> **Phase baseline tree**: `3a31a5d3e1c586daea3149a401da9a7912e33a2e`
> **Reviewed completion commit**: `1ac721e9`
> **Disposition**: Done — accepted corrections and bounded residuals verified

## Review Result

The mandatory correctness, security, and concurrency reviews found seven unique Major defects and
two Minor maintainability/evidence-description defects. Auto-design accepted every Major
correction inside the already-authorized administrative-data scope. No finding is waived and
Phase 3 remains open until the correction diff verifies and completes its one bounded re-review.

| Finding | Severity | Accepted correction |
| --- | --- | --- |
| RV-301 | Major | Normalize the SDK's legacy `dryRun` shorthand to the server's closed `mode: dry-run` request and make the CLI send only the canonical mode. |
| RV-302 | Major | Give dry-run newly planned organizations, applications, and users transaction-local symbolic identities so dependent entries can be validated without persistence. |
| RV-303 / SA-302 | Major | Apply the existing slug, login-method, OIDC client, URI, PKCE, and expiry semantics during complete manifest prevalidation. |
| RV-304 / SA-301 / RV-35N-02 | Major | Require an existing globally shared application declared by a tenant-scoped import to have a current client relationship with that tenant before update or use. |
| RV-35N-01 | Major | Include organization authority in the client natural-key lookup and use a serializable transaction so concurrent absent-key creation fails closed. |
| RV-305 | Major | Reject sensitive system configuration, validate values against the stored type, and preserve JSONB value types. |
| RV-35N-03 | Major | Retain application scope and normalized audit-window bounds in the durable export audit metadata. |
| RV-306 | Minor | The import implementation exceeds the preferred file-size ceiling; decomposition is recommended when the module next receives structural work. |
| SA-303 | Minor | Packed evidence should describe its digest as protected entity state and report the separately observed audit side effect independently. |

## Evidence Before Correction

Clean packed run `166972da-8f43-4f3d-a213-1323a2a03e3a` is truthful for the four journeys it
executed. SDK bulk rejection, SDK import dry-run, SDK user export, and CLI user export all matched
their independent raw controls; protected entity digests and caller credentials were unchanged;
temporary homes and the consumer were removed; and owned residue was empty.

That evidence does not close the review findings because it does not exercise a newly created
dependency graph in dry-run, a foreign shared application declaration, concurrent same-key client
imports, or typed/sensitive configuration updates. The correction work adds those exact boundaries
without changing the approved import/export contract.

## Bounded Re-review

The one bounded re-review found three accepted residuals in the correction diff. Phase 3 remains
open until their focused and full verification passes.

| Finding | Severity | Accepted correction |
| --- | --- | --- |
| RV-307 / RV-35N-R1 | Major | Replace session-scoped advisory locks and fallible post-commit unlocks with transaction-scoped locks; pool cleanup cannot revise a committed result or original transaction error. |
| RV-308 | Major | Resolve role, permission, user, and claim relationship endpoints independently from either transaction-local planned identities or the validated database snapshot. |
| SA-302-R1 | Major | Apply canonical reserved-name and value-type validation to imported custom claims before any dry-run or write admission. |

Focused unit and service-backed PostgreSQL regressions cover the three boundaries. The review found
no other Critical or Major residual in the accepted correction surface.

## Closure Evidence

- Focused administrative implementation tests: 14 passed.
- Service-backed import/export integration tests: 17 passed.
- Server lint and typecheck passed; repository structure passed 70/70.
- Full `yarn verify` passed in 9m27s: server unit 2,837, integration 343, E2E 129,
  pentest 224, SDK 404, and CLI 356 tests.
- The correction was completed without weakening assertions, suppressing failures, or modifying
  established migrations.
